const { Kafka } = require('kafkajs');

// Kafka configuration
const kafka = new Kafka({
  clientId: 'shopping-backend',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

// Create producer and consumer instances
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'shopping-backend-group' });

// Topics
const TOPICS = {
  ORDER_EVENTS: 'order-events',
  DELIVERY_TRACKING: 'delivery-tracking',
  NOTIFICATIONS: 'notifications',
  INVENTORY_UPDATES: 'inventory-updates',
  ANALYTICS: 'analytics',
  PAYMENT_EVENTS: 'payment-events'
};

// Initialize Kafka connections
const initKafka = async () => {
  try {
    // Connect producer
    await producer.connect();
    console.log('Kafka producer connected');

    // Connect consumer
    await consumer.connect();
    console.log('Kafka consumer connected');

    // Subscribe to topics
    await consumer.subscribe({ topics: Object.values(TOPICS), fromBeginning: false });
    console.log('Kafka consumer subscribed to topics');

  } catch (error) {
    console.error('Kafka initialization failed:', error);
    throw error;
  }
};

// Producer helper functions
const publishEvent = async (topic, message) => {
  try {
    await producer.send({
      topic,
      messages: [
        {
          key: message.key || null,
          value: JSON.stringify({
            ...message,
            timestamp: new Date().toISOString()
          })
        }
      ]
    });
    console.log(`Event published to ${topic}:`, message);
  } catch (error) {
    console.error(`Failed to publish event to ${topic}:`, error);
    throw error;
  }
};

// Consumer helper functions
const consumeEvents = async (handler) => {
  try {
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const event = JSON.parse(message.value.toString());
          await handler(topic, event);
        } catch (error) {
          console.error(`Error processing message from ${topic}:`, error);
        }
      }
    });
  } catch (error) {
    console.error('Error in consumer:', error);
    throw error;
  }
};

// Graceful shutdown
const disconnectKafka = async () => {
  try {
    await producer.disconnect();
    await consumer.disconnect();
    console.log('Kafka connections closed');
  } catch (error) {
    console.error('Error disconnecting Kafka:', error);
  }
};

module.exports = {
  kafka,
  producer,
  consumer,
  TOPICS,
  initKafka,
  publishEvent,
  consumeEvents,
  disconnectKafka
};