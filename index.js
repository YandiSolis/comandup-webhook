const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
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
        const urlGreenAPI = `https://7107.api.greenapi.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.API_TOKEN_INSTANCE}`;

        // CUANDO SE ACABA EL PRODUCTO (Estado 0)
        if (producto.status == 0) {
            const msjAgotado = `🛑 *ALERTA COMANDUP: PRODUCTO AGOTADO (86)* 🛑\nEl platillo *${producto.label}* está FUERA DE VENTA. No lo ofrezcan hasta nuevo aviso.`;
            try {
                await axios.post(urlGreenAPI, { chatId: process.env.PHONE_GERENTE, message: msjAgotado });
                if (process.env.GROUP_MESEROS) {
                    await axios.post(urlGreenAPI, { chatId: process.env.GROUP_MESEROS, message: msjAgotado });
                }
            } catch (error) { console.error("❌ Error enviando 86:", error.message); }
        } 
        // CUANDO REGRESA A LA VENTA (Estado 1)
        else if (producto.status == 1) {
            const msjDisponible = `✅ *ALERTA COMANDUP: PRODUCTO DISPONIBLE* ✅\nEl platillo *${producto.label}* vuelve a estar a la venta. ¡Ya pueden ofrecerlo de nuevo!`;
            try {
                await axios.post(urlGreenAPI, { chatId: process.env.PHONE_GERENTE, message: msjDisponible });
                if (process.env.GROUP_MESEROS) {
                    await axios.post(urlGreenAPI, { chatId: process.env.GROUP_MESEROS, message: msjDisponible });
                }
            } catch (error) { console.error("❌ Error enviando alerta de disponibilidad:", error.message); }
        }
    }
    res.status(200).send("Webhook Dolibarr procesado");
});

// ==========================================
// 2. OÍDO PARA WHATSAPP (El Chatbot con Radar)
// ==========================================
app.post('/webhook/whatsapp', async (req, res) => {
    try {
        const webhookData = req.body;
        console.log("📱 [RADAR WA] Webhook recibido tipo:", webhookData.typeWebhook);

        if (webhookData.typeWebhook === 'incomingMessageReceived' || webhookData.typeWebhook === 'outgoingMessageReceived') {
            const messageData = webhookData.messageData || {};
            let mensajeBruto = "";
            
            // Extraemos el texto sin importar si es un mensaje normal o una respuesta
            if (messageData.typeMessage === 'textMessage') {
                mensajeBruto = messageData.textMessageData?.textMessage;
            } else if (messageData.typeMessage === 'extendedTextMessage') {
                mensajeBruto = messageData.extendedTextMessageData?.text;
            }
            
            const mensaje = (mensajeBruto || "").trim().toLowerCase();
            const chatId = webhookData.senderData?.chatId;

            console.log(`💬 [RADAR WA] Mensaje leído en chat ${chatId}: "${mensaje}"`);

            if (mensaje === '!reporte') {
                console.log("📊 [RADAR WA] Comando !reporte detectado. Preparando envío...");
                const msj = `📊 *REPORTE RÁPIDO COMANDUP*\n\n🧾 *Tickets:* ${ticketsAtendidos}\n💰 *Ventas:* $${ventasDelDia.toFixed(2)}`;
                const url = `https://7107.api.greenapi.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.API_TOKEN_INSTANCE}`;
                
                await axios.post(url, { chatId: chatId, message: msj });
                console.log("✅ [RADAR WA] Reporte enviado con éxito a WhatsApp.");
            }
        }
    } catch (error) { 
        console.error("❌ [RADAR WA] Error en el Chatbot:", error.message); 
    }
    
    // Siempre hay que responderle un 200 a GreenAPI para que no crea que el servidor está caído
    res.status(200).send("Webhook GreenAPI procesado");
});

// ==========================================
// 3. CORTE DE CAJA AUTOMÁTICO (El Reloj Corregido)
// ==========================================
// Agregamos el parámetro de Timezone para que respete el horario local y no el del servidor
cron.schedule('0 22 * * *', async () => {
    console.log("⏰ ¡Reloj activado! Generando cierre de caja automático...");
    const textoCierre = `🌙 *CIERRE DE TURNO COMANDUP* 🌙\n\nEl turno ha finalizado de manera automática. Resumen de hoy:\n\n🧾 *Total de tickets:* ${ticketsAtendidos}\n💰 *Ingresos totales:* $${ventasDelDia.toFixed(2)}\n\n_La caja virtual ha sido reiniciada para mañana. ¡Buen descanso!_`;

    try {
        const urlGreenAPI = `https://7107.api.greenapi.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.API_TOKEN_INSTANCE}`;
        await axios.post(urlGreenAPI, { chatId: process.env.PHONE_GERENTE, message: textoCierre });
        console.log("✅ Corte de caja automático enviado a WhatsApp.");

        ventasDelDia = 0;
        ticketsAtendidos = 0;

    } catch (error) {
        console.error("❌ Error al enviar el corte automático:", error.message);
    }
}, {
    timezone: "America/Monterrey"
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Servidor ComandUp en línea (Puerto ${PORT})`);
});