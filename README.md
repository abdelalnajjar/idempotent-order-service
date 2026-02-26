Name: Abdel Rahman Alnajjar
Course: Cloud Computing (CS-218)
Assignment 2 – Serverless Order API


Serverless Order API
Assignment 2 – Idempotency, Retries, and Eventual Consistency

Overview
This project implements an Order Service that guarantees exactly-once effects under at-least-once delivery conditions.

The system prevents:
    Duplicate order creation
    Double charging customers
    Data corruption under retries and partial failures

It achieves this using application-level idempotency with persistent request fingerprinting.


Tech Stack
    Node.js
    Express
    SQLite
    UUID
    Nginx
    Crypto (SHA-256 hashing)
    AWS EC2 (single instance deployment)


-----------------------------------------------------
EC2 Configuration
    Instance Type: t2.micro
    Operating System: Ubuntu
    Public IP: 54.153.75.245
    SSH Access:
        ssh -i idempotent-order-service-key.pem ubuntu@54.153.75.245

-----------------------------------------------------

Security Group Configuration
    Inbound Rules:
    | Type | Port | Source    |
    | ---- | ---- | --------- |
    | SSH  | 22   | My IP     |
    | HTTP | 80   | 0.0.0.0/0 |

Port 3000 is not publicly exposed.
Traffic flows through Nginx on port 80.

-----------------------------------------------------

Port Configuration
    The application runs internally on:
    localhost:3000
    Nginx acts as a reverse proxy:
    Client → Port 80 → Nginx → localhost:3000

    Public endpoint:
        http://54.153.75.245
-----------------------------------------------------

Deployment Steps
    ssh -i idempotent-order-service-key.pem ubuntu@54.153.75.245

-----------------------------------------------------
Install Dependencies

    Project Dependencies (If tested on a local machine)
        npm install

    System Dependencies (EC2 only)
        sudo apt update
        sudo apt install nodejs npm git nginx -y
-----------------------------------------------------
Clone Repository
    git clone https://github.com/abdelalnajjar/idempotent-order-service.git
    cd idempotent-order-service
    npm install
-----------------------------------------------------
Start Application
    node app.js
-----------------------------------------------------

