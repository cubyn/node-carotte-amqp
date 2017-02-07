const amqp = require('amqplib');

if (!process.argv[2]) {
	console.error('First parameter is queue name and is mandatory');
	process.exit(1);
}

amqp.connect('amqp://localhost').then((conn) => {
        return conn.createChannel();
	})
	.then((ch) => {
		// exchange name, used by producers and consumers in this POC.
		// in production, all consumers/producers share the same exchange based on
		// how they want to send/deliver the message
		// see exchanges descriptions here: https://www.rabbitmq.com/tutorials/amqp-concepts.html
		const exchangeName = 'amq.topic';
		//process.argv[2] is the first argument
		const routingKey = process.argv[2];
		//arg 2 is the number of message to send, default is 500
		const messageCount = parseInt(process.argv[3]) || 500;
		//arg 3 is the delay between messages, default is 1 sec
		const messageDelay = parseInt(process.argv[4]) || 1000;

		// create the exchange with type 'topic'. Topic means that messages
		// will be distributed based on the exchange key (see below)
		// durable means that the exchange will not be removed if all consumers/producers disconnects form the exchange
		// it is useful for important message exchanges, and is most of the time true
		ch.assertExchange(exchangeName, 'topic', { durable: true })

		console.log(`[Producer] Ready to produce on ${exchangeName}:${routingKey}`);

		let i = 0;
		const interval = setInterval(() => {
			console.log(`Sending message on ${routingKey} (${i})`);

			// here we publish a message in the confiured exchange, with a routing key
			// for example, a routing key can be parcel.event.picked
			// subscribers to parcel.event.* or parcel.event.picked will receive it
			// see exchange type topic for more info
			ch.publish(exchangeName, routingKey, new Buffer(''+i++));

			// stop process when done
			if (i === messageCount) {
				clearInterval(interval);
				console.log('Done');
				process.exit(0);
			}
		}, messageDelay);
	})
	.catch(console.warn);
