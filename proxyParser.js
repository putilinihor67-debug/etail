const fs = require('fs');
const path = require('path');

const parseAndSaveProxies = (proxyList, useProxy) => {
    if (!useProxy) return;
    const proxies = proxyList.split('\n').map(proxy => proxy.trim());
    const proxiesDir = './proxies/';
    if (!fs.existsSync(proxiesDir)){
        fs.mkdirSync(proxiesDir);
    }
    proxies.forEach((proxy, index) => {
        const fileName = `${proxiesDir}proxy_${index + 1}.txt`;
        fs.writeFile(fileName, proxy, (err) => {
            if (err) {
                console.error(`Error writing to file ${fileName}:`, err);
            } else {
                console.log(`Proxy ${index + 1} saved to ${fileName}`);
            }
        });
    });
};

module.exports = { parseAndSaveProxies };