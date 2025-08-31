const socket = new WebSocket('ws://localhost:3000');

socket.onmessage = function(event) {
    try {
        const data = JSON.parse(event.data);
        if (data.type === 'result') {
            document.getElementById('terminal').innerText += `[INFO] ${JSON.stringify(data.data)}\n`;
        } else if (data.type === 'error') {
            document.getElementById('terminal').innerText += `[ERROR] ${data.message}\n`;
        } else if (data.type === 'info') {
            document.getElementById('terminal').innerText += `[TASK] ${data.message}\n`;
        }
        updateProgress();
    } catch (error) {
        console.error('Error parsing WebSocket message:', error);
    }
};

function startCheck() {
    const formData = new FormData(document.getElementById('emailForm'));
    const file = formData.get('emailPassFile');
    if (!file) {
        console.error('No file selected');
        return;
    }
    const reader = new FileReader();
    reader.onload = function(event) {
        const content = event.target.result;
        formData.append('emailPass', content);
        fetch('/check-email', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => console.log('Success:', data))
        .catch((error) => console.error('Error:', error));
    };
    reader.readAsText(file);
}

function stopCheck() {
    socket.send(JSON.stringify({ action: 'stop' }));
}

function resetCheck() {
    document.getElementById('terminal').innerText = '';
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('progressBar').innerText = '0%';
    document.getElementById('results').innerHTML = '';
}

function updateProgress() {
    const emailPassFile = document.getElementById('emailPassFile');
    if (!emailPassFile || !emailPassFile.files || emailPassFile.files.length === 0) {
        console.error('No email pass file selected');
        return;
    }
    const totalEmails = emailPassFile.files[0].size / 1024; // Approximate number of emails
    const checkedEmails = document.getElementById('terminal').innerText.split('\n').filter(line => line.includes('Email check result')).length;
    const percentage = (checkedEmails / totalEmails) * 100;
    document.getElementById('progressBar').style.width = `${percentage}%`;
    document.getElementById('progressBar').innerText = `${Math.round(percentage)}%`;
}

document.getElementById('filterProvider').addEventListener('change', function() {
    filterResults(this.value);
});

function filterResults(provider) {
    const resultsContainer = document.getElementById('results');
    resultsContainer.innerHTML = '';
    const terminalText = document.getElementById('terminal').innerText;
    const match = terminalText.match(/Email check results: (.*)/s);
    if (match) {
        const results = JSON.parse(match[1]);
        results.forEach(result => {
            if (provider === '' || result.email.includes(provider)) {
                const resultItem = document.createElement('div');
                resultItem.className = 'result-item';
                resultItem.innerHTML = `<strong>Email:</strong> ${result.email}<br><strong>Results:</strong> ${result.results.join(', ')}<br><strong>Error:</strong> ${result.error || 'None'}`;
                resultsContainer.appendChild(resultItem);
            }
        });
    } else {
        console.error('No results found in terminal text');
    }
}

function parseProxies() {
    const proxyList = document.getElementById('proxyList').value;
    // Logic to parse and save proxies
    alert('Proxies parsed and saved!');
}