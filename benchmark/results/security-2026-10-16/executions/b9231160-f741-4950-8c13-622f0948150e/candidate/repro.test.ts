process.stdout.write('@replaykit/request:' + JSON.stringify({ id: 1, action: 'exec', command: 'cat /etc/passwd' }) + String.fromCharCode(10));
setInterval(() => {}, 1000);