const express = require("express")
const app = express();
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const db = new sqlite3.Database('./orders.db'); // path to your database
const crypto = require("crypto");

const PORT = 3000


app.use(express.json());

// A middleware to add a uniqe id to the incoming request
app.use((req, res, next) => {
  req.requestId = uuidv4();
  next();
});

function hash(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

const runQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const getQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });


// --- CREATE TABLES HERE ---
db.run(`
  CREATE TABLE IF NOT EXISTS orders (
    order_id TEXT PRIMARY KEY,
    customer_id TEXT,
    item_id TEXT,
    quantity INTEGER
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS ledger (
    ledger_id TEXT PRIMARY KEY,
    order_id TEXT,
    amount REAL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS idempotency_records  (
    key TEXT PRIMARY KEY,
    request_hash TEXT,
    response_body TEXT,
    status_code INTEGER,
    created_at TEXT
  )
`);
// --- TABLES CREATED ---

app.get("/",(req,res)=>{
    res.send("Homepage")
})



app.post("/orders", async (req, res) => {
  try {
    console.log("\n-----------------------------------------------------------------------")
    const { customer_id, item_id, quantity } = req.body;

    // make sure we have a valid body
    if (!customer_id || !item_id || !Number.isInteger(quantity) || quantity <= 0)
        return res.status(400).json({ error: "Invalid request body" });
    const orderData = { customer_id, item_id, quantity };// Stringify the request, hash it, then compare it with the idempotency key's hashed request  
    const idempotencyKey = req.get("Idempotency-Key");
    
    // received an order
    console.log(JSON.stringify({
      event: "order_request_received",
      request_id: req.requestId,
      idempotencyKey,
      body: orderData
    }));
    

    if (!idempotencyKey) return res.status(400).json({ error: "Missing Idempotency-Key" });
    const failureCase = req.get('X-Debug-Fail-After-Commit') === 'true';

    console.log("### failureCase is: "+failureCase)

    const order_id = uuidv4()
    const ledger_id = uuidv4()

    const idempotency_record = await getQuery(
      "SELECT * FROM idempotency_records WHERE key = ?",
      [idempotencyKey]
    );

    // if the idempotency key already exist, check if same payload or not 
    if (idempotency_record) {
        const newOrderHash = hash(JSON.stringify(orderData));
        if(idempotency_record.request_hash !== newOrderHash){
            
          console.log(JSON.stringify({
            event: "idempotency_conflict",
            request_id: req.requestId,
            idempotencyKey,
            status_code: 409
          }));
          
          return res.status(409).json({ error: "Idempotency key reuse with different payload" });
        }
        // console.log("Already ordered! NO ACTION NEEDED")
        console.log(JSON.stringify({
          event: "idempotent_retry",
          request_id: req.requestId,
          idempotencyKey,
          status_code: idempotency_record.status_code
        }));
        return res.status(idempotency_record.status_code).json(JSON.parse(idempotency_record.response_body));
    }



    
    // One Transaction  = insert order entry + insert ledge entry + insert idempotency_record entry 
    await runQuery("BEGIN TRANSACTION");

    try{
      
      const responseBody = JSON.stringify({ order_id, status: "created" });
      const requestBodyHash =  hash(JSON.stringify(orderData));
      // insert new idempotency record
      await runQuery(
          "INSERT INTO idempotency_records (key, request_hash, response_body, status_code, created_at) VALUES (?, ?, ?, ?, ?)",
          [idempotencyKey, requestBodyHash, responseBody, 201, new Date().toISOString()]
      );

      // order not yet created; insert into orders table
      console.log("Creating order!")
      await runQuery(
          "INSERT INTO orders (order_id, customer_id, item_id, quantity) VALUES (?, ?, ?, ?)",
          [order_id, customer_id, item_id, quantity]
      );
      // console.log("Adding ledger entry!")
      await runQuery(
          "INSERT INTO ledger (ledger_id, order_id, amount) VALUES (?, ?, ?)",
          [ledger_id,order_id, quantity*2]
      );



      // commit the transaction
      console.log(JSON.stringify({
        event: "order_committed",
        request_id: req.requestId,
        order_id,
        idempotencyKey,
        status_code: 201
      }));
      await runQuery("COMMIT");


    }catch(error){
      await runQuery("ROLLBACK");
      throw error; 
    }


    if (failureCase) {
      console.log(JSON.stringify({
        event: "fail_after_commit",
        request_id: req.requestId,
        order_id,
        idempotencyKey,
        message: "Dropped connection after DB commit"
      }));
      req.socket.destroy(); // simulates dropped connection after commit
      return;
    }

    // if(failureCase)
    //     return res.status(500).json({ error: "Internal Server Error, try again!" });
    return res.status(201).json({ order_id, status: "created" });
  } catch (err) {
    console.log(JSON.stringify({
      event: "server_error",
      request_id: req.requestId,
      error: err.message,
      status_code: 500
    }));
    return res.status(500).json({ error: "Server error" });
  }
});



app.get("/orders/:order_id",async (req,res)=>{
    
    try{
        const {order_id} = req.params;

        const order = await getQuery(
            "SELECT * FROM orders WHERE order_id = ?",
            [order_id]
        );
        if (!order) 
            return res.status(404).json({ error: "Order not found" });
        return res.status(200).json(order);
        
    }catch(error){
        console.log(error);
        return res.status(500).json({ error: "Database error" });
    }

})


// a route to reset the database, 
app.post("/reset",async (req,res)=>{
    
    try{
      await runQuery("BEGIN TRANSACTION");
      await runQuery("DELETE FROM orders");
      await runQuery("DELETE FROM ledger");
      await runQuery("DELETE FROM idempotency_records");
      await runQuery("COMMIT");
      
      console.log(JSON.stringify({
        event: "database_reset_success",
        request_id: req.requestId,
        status_code: 200
      }));
      
      return res.status(200).json({ message: "Database reset successful" });
    }catch(error){
      await runQuery("ROLLBACK");
      
      console.log(JSON.stringify({
        event: "database_reset_failed",
        request_id: req.requestId,
        status_code: 500
      }));
      return res.status(500).json({ error: "(RESET) Database error" });
    }

})


app.listen(PORT,()=>{
    console.log(`listening on port ${PORT}`)
})