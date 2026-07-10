const express = require('express');
const axios = require('axios');
const cron = require('node-cron'); // 👈 Importamos el reloj
const app = express();

app.use(express.json());

// ==========================================
// MEMORIA DEL TURNO (Alcancía virtual)
// ==========================================
let ventasDelDia = 0;
let ticketsAtendidos = 0;

// ==========================================
// 1. OÍDO PARA DOLIBARR (Alertas y sumas)
// ==========================================
app.post('/webhook/alertas', async (req, res) => {
    const datos = req.body;
    console.log("📥 ¡Evento detectado por ComandUp! Código:", datos.triggercode);

    if (datos.triggercode === 'BILL_VALIDATE') {
        const factura = datos.object;
        let mensajeWhatsApp = '';
        let enviarAlerta = false;

        if (factura.type == 2) {
            ventasDelDia -= parseFloat(factura.total_ttc);
            ticketsAtendidos -= 1;
            mensajeWhatsApp = `🚨 *ALERTA COMANDUP: CANCELACIÓN* 🚨\nSe generó una Nota de Crédito.\nTicket: ${factura.ref}\nMonto devuelto: $${factura.total_ttc}`;
            enviarAlerta = true;
        } else {
            ventasDelDia += parseFloat(factura.total_ttc);
            ticketsAtendidos += 1;
            if (factura.remise_percent && parseFloat(factura.remise_percent) >= 15) {
                mensajeWhatsApp = `⚠️ *ALERTA COMANDUP: DESCUENTO ALTO* ⚠️\nSe aplicó un descuento del ${factura.remise_percent}% a una cuenta.\nTicket: ${factura.ref}\nTotal: $${factura.total_ttc}`;
                enviarAlerta = true;
            }
        }

        if (enviarAlerta) {
            try {
                const url = `https://7107.api.greenapi.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.API_TOKEN_INSTANCE}`;
                await axios.post(url, { chatId: process.env.PHONE_GERENTE, message: mensajeWhatsApp });
            } catch (error) { console.error("❌ Error enviando alerta:", error.message); }
        }
    } 
    else if (datos.triggercode === 'PRODUCT_MODIFY') {
        const producto = datos.object;
        if (producto.status == 0) {
            const msj = `🛑 *ALERTA COMANDUP: PRODUCTO AGOTADO (86)* 🛑\nEl platillo *${producto.label}* está FUERA DE VENTA.`;
            try {
                const url = `https://7107.api.greenapi.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.API_TOKEN_INSTANCE}`;
                await axios.post(url, { chatId: process.env.PHONE_GERENTE, message: msj });
            } catch (error) { console.error("❌ Error enviando 86:", error.message); }
        }
    }
    res.status(200).send("Webhook Dolibarr procesado");
});

// ==========================================
// 2. OÍDO PARA WHATSAPP (El Chatbot)
// ==========================================
app.post('/webhook/whatsapp', async (req, res) => {
    try {
        const webhookData = req.body;
        if (webhookData.typeWebhook === 'incomingMessageReceived' || webhookData.typeWebhook === 'outgoingMessageReceived') {
            const messageData = webhookData.messageData || {};
            let mensajeBruto = messageData.typeMessage === 'textMessage' ? messageData.textMessageData?.textMessage : (messageData.typeMessage === 'extendedTextMessage' ? messageData.extendedTextMessageData?.text : "");
            
            const mensaje = (mensajeBruto || "").trim().toLowerCase();
            const chatId = webhookData.senderData?.chatId;

            if (mensaje === '!reporte') {
                const msj = `📊 *REPORTE RÁPIDO COMANDUP*\n\n🧾 *Tickets:* ${ticketsAtendidos}\n💰 *Ventas:* $${ventasDelDia.toFixed(2)}`;
                const url = `https://7107.api.greenapi.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.API_TOKEN_INSTANCE}`;
                await axios.post(url, { chatId: chatId, message: msj });
            }
        }
    } catch (error) { console.error("❌ Error WhatsApp:", error.message); }
    res.status(200).send("Webhook GreenAPI procesado");
});

// ==========================================
// 3. CORTE DE CAJA AUTOMÁTICO (El Reloj)
// ==========================================
// MODO PRUEBA: '* * * * *' = El reporte se enviará CADA MINUTO exacto.
cron.schedule('0 22 * * *', async () => {
    console.log("⏰ ¡Reloj activado! Generando cierre de caja automático...");
    const textoCierre = `🌙 *CIERRE DE TURNO COMANDUP* 🌙\n\nEl turno ha finalizado de manera automática. Resumen de hoy:\n\n🧾 *Total de tickets:* ${ticketsAtendidos}\n💰 *Ingresos totales:* $${ventasDelDia.toFixed(2)}\n\n_La caja virtual ha sido reiniciada para mañana. ¡Buen descanso!_`;

    try {
        const urlGreenAPI = `https://7107.api.greenapi.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.API_TOKEN_INSTANCE}`;
        // Mandamos el mensaje al gerente usando la variable de entorno
        await axios.post(urlGreenAPI, { chatId: process.env.PHONE_GERENTE, message: textoCierre });
        console.log("✅ Corte de caja automático enviado a WhatsApp.");

        // ¡Vaciamos la alcancía para el día siguiente!
        ventasDelDia = 0;
        ticketsAtendidos = 0;

    } catch (error) {
        console.error("❌ Error al enviar el corte automático:", error.message);
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Servidor ComandUp en línea (Puerto ${PORT})`);
});