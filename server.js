const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const amqp = require('amqplib');
const nodemailer = require('nodemailer');
const { parseAndSaveProxies } = require('./proxyParser'); // Вынесем в отдельный модуль

const app = express();
const port = 3000;

// Добавляем middleware для парсинга JSON
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', function connection(ws) {
    ws.on('message', function incoming(message) {
        const data = JSON.parse(message);
        if (data.action === 'stop') {
            // Implement stop logic here
        }
    });

    ws.send(JSON.stringify({ type: 'info', message: 'Connected to the server' }));
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.post('/check-email', async (req, res) => {
    const { emailPass, apiKey, httpsRequest, proxy, useProxy, emailProviders, pop3, imap, smtp } = req.body;

    // Логируем полученные данные
    console.log('Received data:', { emailPass, apiKey, httpsRequest, proxy, useProxy, emailProviders, pop3, imap, smtp });

    // Parse and save proxies
    parseAndSaveProxies(proxy, useProxy);

    // Check emails using RabbitMQ
    try {
        await checkEmailsWithRabbitMQ(emailPass, emailProviders, pop3, imap, smtp, useProxy, proxy);
        res.json({ message: 'Email check initiated' });
    } catch (error) {
        console.error('Error checking emails:', error);
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'error', message: `Email check error: ${error.message}` }));
            }
        });
        res.status(500).json({ error: 'Email check failed' });
    }
});

const checkEmailsWithRabbitMQ = async (emailPassList, emailProviders, pop3, imap, smtp, useProxy, proxy) => {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();

        const queue = 'email_check_queue';
        await channel.assertQueue(queue, { durable: false });

        const emailPassArray = emailPassList.split('\n').map(line => line.trim());
        const totalTasks = emailPassArray.length;
        let completedTasks = 0;

        for (const emailPass of emailPassArray) {
            const replyQueue = await channel.assertQueue('', { exclusive: true });
            const correlationId = generateCorrelationId();

            channel.sendToQueue(queue, Buffer.from(JSON.stringify({
                emailPass,
                emailProviders,
                pop3,
                imap,
                smtp,
                useProxy,
                proxy
            })), {
                persistent: true,
                correlationId: correlationId,
                replyTo: replyQueue.queue
            });

            channel.consume(replyQueue.queue, (msg) => {
                if (msg.properties.correlationId === correlationId) {
                    let result;
                    try {
                        result = JSON.parse(msg.content.toString());
                    } catch (err) {
                        console.error('Invalid message format:', err);
                        return;
                    }
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: 'result', data: result }));
                            if (result.error) {
                                client.send(JSON.stringify({ type: 'error', message: `Email check error for ${result.email}: ${result.error}` }));
                            }
                        }
                    });
                    completedTasks++;
                    if (completedTasks === totalTasks) {
                        wss.clients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({ type: 'info', message: 'All email checks completed.' }));
                            }
                        });
                    }
                }
            }, { noAck: true });
        }
    } catch (error) {
        console.error("RabbitMQ connection error:", error.message);
        throw error;
    }
};

const generateCorrelationId = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});