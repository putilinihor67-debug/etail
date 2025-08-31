const amqp = require('amqplib');
const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const SmtpTransport = require('nodemailer-smtp-transport');
const SocksProxyAgent = require('socks-proxy-agent');
const fs = require('fs');
const path = require('path');
const POP3Client = require('poplib');

const providerConfig = {
  gmail: {
    smtp: { host: 'smtp.gmail.com', port: 587 },
    imap: { host: 'imap.gmail.com', port: 993 },
    pop3: { host: 'pop.gmail.com', port: 995 }
  },
  hotmail: {
    smtp: { host: 'smtp.office365.com', port: 587 },
    imap: { host: 'imap.office365.com', port: 993 },
    pop3: { host: 'pop.office365.com', port: 995 }
  },
  yandex: {
    smtp: { host: 'smtp.yandex.ru', port: 465 },
    imap: { host: 'imap.yandex.ru', port: 993 },
    pop3: { host: 'pop.yandex.ru', port: 995 }
  },
  protonmail: {
    smtp: { host: 'smtp.protonmail.com', port: 587 },
    imap: { host: 'imap.protonmail.com', port: 993 },
    pop3: { host: 'pop.protonmail.com', port: 995 }
  },
  zoho: {
    smtp: { host: 'smtp.zoho.com', port: 587 },
    imap: { host: 'imap.zoho.com', port: 993 },
    pop3: { host: 'pop.zoho.com', port: 995 }
  },
  mailcom: {
    smtp: { host: 'smtp.mail.com', port: 587 },
    imap: { host: 'imap.mail.com', port: 993 },
    pop3: { host: 'pop.mail.com', port: 995 }
  },
  aol: {
    smtp: { host: 'smtp.aol.com', port: 587 },
    imap: { host: 'imap.aol.com', port: 993 },
    pop3: { host: 'pop.aol.com', port: 995 }
  },
  icloud: {
    smtp: { host: 'smtp.mail.me.com', port: 587 },
    imap: { host: 'imap.mail.me.com', port: 993 },
    pop3: { host: 'pop.mail.me.com', port: 995 }
  }
};

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
  ]);

const processEmailProvider = async (provider, email, pass, pop3, imap, smtp, useProxy, proxy) => {
  const transporterConfig = providerConfig[provider].smtp;
  const pop3Config = providerConfig[provider].pop3;
  const imapConfig = providerConfig[provider].imap;

  let transporter = nodemailer.createTransport(transporterConfig);

  if (useProxy) {
    const agent = new SocksProxyAgent(proxy);
    transporter = nodemailer.createTransport(SmtpTransport({
      host: transporterConfig.host,
      port: transporterConfig.port,
      secure: transporterConfig.secure,
      auth: {
        user: email,
        pass: pass
      },
      agent: agent
    }));
  }

  let emailResults = [];

  if (pop3) {
    const pop3Client = new POP3Client();
    await withTimeout(new Promise((resolve, reject) => {
      pop3Client.connect(pop3Config.host, pop3Config.port, (err) => {
        if (err) {
          reject(err);
        } else {
          pop3Client.login(email, pass, (err) => {
            if (err) {
              reject(err);
            } else {
              pop3Client.list((err, messages) => {
                if (err) {
                  reject(err);
                } else {
                  emailResults.push(`POP3 Messages for ${email}: ${messages.length}`);
                  pop3Client.quit(() => {
                    resolve();
                  });
                }
              });
            }
          });
        }
      });
    }), 5000);
  }

  if (imap) {
    const imapClient = new ImapFlow(imapConfig);
    await imapClient.connect();
    const searchCriteria = await imapClient.search(['ALL']);
    const messages = await imapClient.fetch(searchCriteria, { envelope: true });
    emailResults.push(`IMAP Messages for ${email}: ${messages.length}`);
    await imapClient.logout();
  }

  if (smtp) {
    const info = await transporter.sendMail({
      from: email,
      to: email,
      subject: 'Test Email',
      text: 'This is a test email.'
    });
    emailResults.push(`SMTP Email sent to ${email}: ${info.response}`);
  }

  return emailResults;
};

let smtpSuccess = 0;
let imapSuccess = 0;
let pop3Success = 0;
let errors = 0;

amqp.connect('amqp://localhost', (error0, connection) => {
  if (error0) {
    throw error0;
  }
  connection.createChannel((error1, channel) => {
    if (error1) {
      throw error1;
    }
    const queue = 'email_check_queue';

    channel.assertQueue(queue, { durable: false });
    channel.prefetch(1);

    console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", queue);

    channel.consume(queue, async (msg) => {
      const data = JSON.parse(msg.content.toString());
      const { emailPass, emailProviders, pop3, imap, smtp, useProxy, proxy } = data;
      const [email, pass] = emailPass.split(':');

      if (!email || !pass) {
        throw new Error('Invalid email:pass format');
      }

      if (!Array.isArray(emailProviders)) {
        throw new Error('emailProviders must be an array');
      }

      let allResults = {};

      for (const provider of emailProviders) {
        if (!(provider in providerConfig)) {
          allResults[provider] = [`Error for ${provider}: Unsupported provider`];
          continue;
        }

        try {
          const startTime = Date.now();
          allResults[provider] = await processEmailProvider(provider, email, pass, pop3, imap, smtp, useProxy, proxy);
          const endTime = Date.now();
          const duration = endTime - startTime;

          if (pop3) pop3Success++;
          if (imap) imapSuccess++;
          if (smtp) smtpSuccess++;

          const logEntry = `Email: ${email}, Provider: ${provider}, Results: ${allResults[provider].join(', ')}, Duration: ${duration}ms, Timestamp: ${new Date().toISOString()}\n`;
          fs.appendFile(path.join(__dirname, 'email_check_log.txt'), logEntry, (err) => {
            if (err) {
              console.error('Error writing to log file:', err);
            }
          });
        } catch (err) {
          errors++;
          allResults[provider] = [`Error for ${provider}: ${err.message}`];
          const errorLogEntry = `Email: ${email}, Provider: ${provider}, Error: ${err.message}, Timestamp: ${new Date().toISOString()}\n`;
          fs.appendFile(path.join(__dirname, 'email_check_errors.txt'), errorLogEntry, (err) => {
            if (err) {
              console.error('Error writing to error log file:', err);
            }
          });
        }
      }

      channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify({ email, results: allResults })), {
        correlationId: msg.properties.correlationId
      });
      channel.ack(msg);
    });
  });
});

// Периодически выводим метрики
setInterval(() => {
  console.log(`SMTP Success: ${smtpSuccess}, IMAP Success: ${imapSuccess}, POP3 Success: ${pop3Success}, Errors: ${errors}`);
}, 60000); // Каждые 60 секунд