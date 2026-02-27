#!/usr/bin/env node
/**
 * WallDecor Portal — Create first ADMIN user
 * Usage: node scripts/create-admin.js
 * Run from the project root on the server after deployment.
 */

require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const isSQLite = process.env.DB_TYPE === 'sqlite';

async function getDB() {
    if (isSQLite) {
        const Database = require('better-sqlite3');
        return { type: 'sqlite', db: new Database(process.env.DB_PATH || 'walldecor.sqlite') };
    } else {
        const mysql = require('mysql2/promise');
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        return { type: 'mysql', db: conn };
    }
}

function prompt(rl, question) {
    return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log('\n─── WallDecor Portal — Create Admin User ───\n');

    const name = await prompt(rl, 'Full name: ');
    const email = await prompt(rl, 'Email: ');

    rl.stdoutMuted = true;
    process.stdout.write('Password: ');
    const password = await new Promise(resolve => {
        rl.question('', answer => {
            rl.stdoutMuted = false;
            process.stdout.write('\n');
            resolve(answer);
        });
    });
    rl.close();

    if (!name || !email || !password) {
        console.error('All fields are required.');
        process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const id = uuidv4();

    const { type, db } = await getDB();

    try {
        if (type === 'sqlite') {
            db.prepare(
                `INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, 'ADMIN')`
            ).run(id, name, email, hashedPassword);
        } else {
            await db.execute(
                `INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, 'ADMIN')`,
                [id, name, email, hashedPassword]
            );
            await db.end();
        }
        console.log(`\nAdmin user created successfully!`);
        console.log(`  Email: ${email}`);
        console.log(`  Role:  ADMIN\n`);
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT' || err.code === 'ER_DUP_ENTRY') {
            console.error(`Error: User with email '${email}' already exists.`);
        } else {
            console.error('Error creating user:', err.message);
        }
        process.exit(1);
    }
}

main();
