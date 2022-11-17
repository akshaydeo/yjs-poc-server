import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import { fromUint8Array, toUint8Array } from 'js-base64';
import { Server as SocketIoServer } from 'socket.io';
import * as awarenessProtocol from 'y-protocols/awareness.js';
import * as Y from 'yjs';
const socketIoClients = {};
const doc = new Y.Doc();
const awareness = new awarenessProtocol.Awareness(doc);
const text = doc.getText('monaco');
text.insert(0, 'this is the initial text');

const io = new SocketIoServer({
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
    }
});
const app = express();
const port = 8000;
app.use(cors());
app.use(bodyParser.json({
    limit: '100mb'
}));
app.use(bodyParser.raw({
    inflate: true,
    limit: '100m',
    type: 'application/octet-stream'
}))
app.get('/doc', (req, resp) => {
    resp.send({
        update: fromUint8Array(Y.encodeStateAsUpdate(doc)),        
    });
});

// app.post('/docupdate', (req, resp) => {
//     const update = req.body.update;
//     const origin = req.body.origin;
//     const patch = toUint8Array(update);
//     Y.applyUpdate(doc, patch);
//     console.log('pushing updates across', origin)
//     const vector = fromUint8Array(Y.encodeStateVector(doc));
//     Object.keys(socketIoClients).forEach(key => {
//         socketIoClients[key].emit("updates", {
//             update: update,
//             origin: origin
//         });

//         socketIoClients[key].emit("base", {
//             vector
//         });
//     })

//     resp.send({
//         success: true
//     })
// });

app.post('/awareness', (req, resp) => {
    const update = req.body.update;
    awarenessProtocol.applyAwarenessUpdate(awareness, toUint8Array(update));
    Object.keys(socketIoClients).forEach(key => {
        socketIoClients[key].emit("awareness", {
            update: update,
        });
    })
    resp.send({});
});

app.post('/docupdate2', (req, resp) => {
    const updates = req.body.updates;
    const origin = req.body.origin;
    const megaUpdate = Y.mergeUpdates(updates.map((update) => toUint8Array(update)));
    Y.applyUpdate(doc, megaUpdate);
    console.log('pushing updates across', origin)
    const vector = fromUint8Array(Y.encodeStateVectorFromUpdate(megaUpdate));
    const update = fromUint8Array(megaUpdate);
    Object.keys(socketIoClients).forEach(key => {
        socketIoClients[key].emit("updates", {
            update,
            origin: origin
        });        
    })
    resp.send({
        success: true
    })
});

// starting socket.io server on a separate port just for the sake of poc

io.on('connection', client => {
    socketIoClients[client.id] = client;
    console.log('on connection', client.id);
    client.emit('awareness', { update: fromUint8Array(awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awareness.getStates().keys()))) });
    client.on('disconnect', () => {
        delete socketIoClients[client.id];
        console.log('client disconnected');
    });
});
io.listen(8001);

app.listen(port, () => {
    console.log('socket io is running on', 8001);
    console.log('server running on', port);
});