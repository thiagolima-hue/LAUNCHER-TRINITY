const axios = require('axios');

async function updatePlayerCount() {
    if (process.env.OFFLINE_MODE === 'true') {
        const paragraph = document.querySelector('.sopraficarlegal');
        if (paragraph) paragraph.innerHTML = `Modo Offline: Servidor desabilitado`;
        return;
    }
    const serverIp = 'enx-cirion-93.enx.host:10005';
    try {
        console.log('Fetching server data...');
        const response = await axios.get(`https://api.minetools.eu/ping/${serverIp}`);
        const data = response.data;
        const paragraph = document.querySelector('.sopraficarlegal');
        console.log('Paragraph element:', paragraph);

        if (response.data && response.data.players) {
            const players = response.data.players.online;
            console.log('Players online:', players);
            paragraph.innerHTML = `Há ${players} treinadores conectados`;
        } else {
            paragraph.innerHTML = `Há 0 treinadores conectados`;
        }
    } catch (error) {
        console.error('Erro ao obter os dados do servidor:', error);
        const paragraph = document.querySelector('.sopraficarlegal');
        if (paragraph) paragraph.innerHTML = `Erro ao obter dados do servidor`;
    }
}

updatePlayerCount();

setInterval(updatePlayerCount, 60000);
