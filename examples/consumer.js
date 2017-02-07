const amqp = require('amqplib');

if (!process.argv[2]) {
	console.error('First parameter is queue name and is mandatory');
	process.exit(1);
}

amqp.connect('amqp://localhost').then((conn) => {
        return conn.createChannel();
    })
	.then((ch) => {
		const exchangeName = 'poc_topic';
		const routingKey = process.argv[2];
		const queueName = process.argv[3] || `service:${routingKey}`;

		ch.assertExchange(exchangeName, 'topic', { durable: true });

		return ch.assertQueue(queueName, { exclusive: false }).then(q => {
			ch.bindQueue(q.queue, exchangeName, routingKey);
			console.log(`[Consumer] Ready to consume on ${exchangeName}::${routingKey}`);

			return ch.consume(q.queue, msg => {
				console.log(`[${routingKey}] got message: ${msg.content}`);
				ch.ack(msg)
			});
		});
	})
	.catch(console.warn);
