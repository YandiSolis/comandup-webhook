require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

app.post('/webhook/alertas', async (req, res) => {
    const datos = req.body;
    
    // Verificamos si es una cancelación
    if (datos.evento === 'cancelacion_ticket') {
        const urlGreenAPI = `https://api.green-api.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.API_TOKEN_INSTANCE}`;
        
        try {
            await axios.post(urlGreenAPI, {
                chatId: process.env.PHONE_GERENTE,
                message: `🚨 ALERTA COMANDUP: Se ha cancelado el ticket ${datos.id_ticket}. Monto: $${datos.total}. Motivo: ${datos.motivo}`
            });
            console.log('✅ Alerta enviada a WhatsApp');
        } catch (error) {
            console.error('❌ Error al enviar mensaje:', error.message);
        }
    }

    res.status(200).send('Webhook procesado');
});

const PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, '0.0.0.0', () => {
    console.log(`🚀 Servidor de ComandUp escuchando en el puerto ${PUERTO}`);
});