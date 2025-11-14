import mqtt from "mqtt";

export function connectMQTT({ url, onConnect, onDisconnect, onMessage }) {
  const client = mqtt.connect(url);

  client.on("connect", onConnect);
  client.on("close", onDisconnect);
  client.on("message", onMessage);

  return client;
}

export function subscribeTopic(client, topic) {
  client.subscribe(topic, (err) => {
    if (err) console.error("Erro ao inscrever no tópico:", topic);
  });
}

export function disconnectMQTT(client) {
  if (client) client.end();
}
