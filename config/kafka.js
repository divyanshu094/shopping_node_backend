const { Kafka } = require('kafkajs');

/*
|--------------------------------------------------------------------------
| Kafka Configuration
|--------------------------------------------------------------------------
*/

const kafka = new Kafka({
  clientId: 'shopping-backend',

  brokers: [
    process.env.KAFKA_BROKER || 'localhost:9092'
  ],

  retry: {
    initialRetryTime: 300,
    retries: 10
  }
});

/*
|--------------------------------------------------------------------------
| Kafka Instances
|--------------------------------------------------------------------------
*/

const admin = kafka.admin();

const producer = kafka.producer();

const consumer = kafka.consumer({
  groupId: 'shopping-backend-group'
});

/*
|--------------------------------------------------------------------------
| Topics
|--------------------------------------------------------------------------
*/

const TOPICS = Object.freeze({
  ORDER_EVENTS: 'order-events',
  DELIVERY_TRACKING: 'delivery-tracking',
  NOTIFICATIONS: 'notifications',
  INVENTORY_UPDATES: 'inventory-updates',
  ANALYTICS: 'analytics',
  PAYMENT_EVENTS: 'payment-events',
  DEAD_LETTER_QUEUE: 'dead-letter-queue'
});

/*
|--------------------------------------------------------------------------
| Create Kafka Topics
|--------------------------------------------------------------------------
*/

const createTopics = async () => {
  let adminConnected = false;

  try {

    await admin.connect();
    adminConnected = true;

    await admin.createTopics({

      waitForLeaders: true,

      topics: [

        {
          topic: TOPICS.ORDER_EVENTS,
          numPartitions: 3,
          replicationFactor: 1
        },

        {
          topic: TOPICS.DELIVERY_TRACKING,
          numPartitions: 2,
          replicationFactor: 1
        },

        {
          topic: TOPICS.NOTIFICATIONS,
          numPartitions: 2,
          replicationFactor: 1
        },

        {
          topic: TOPICS.INVENTORY_UPDATES,
          numPartitions: 2,
          replicationFactor: 1
        },

        {
          topic: TOPICS.ANALYTICS,
          numPartitions: 5,
          replicationFactor: 1
        },

        {
          topic: TOPICS.PAYMENT_EVENTS,
          numPartitions: 3,
          replicationFactor: 1
        },

        {
          topic: TOPICS.DEAD_LETTER_QUEUE,
          numPartitions: 1,
          replicationFactor: 1
        }

      ]
    });

    console.log('Kafka topics created');

  } catch (error) {

    console.error('Topic creation error:', error);
    throw error;
  } finally {
    if (adminConnected) {
      await admin.disconnect().catch((error) => {
        console.error('Kafka admin disconnect error:', error);
      });
    }
  }
};

/*
|--------------------------------------------------------------------------
| Initialize Kafka
|--------------------------------------------------------------------------
*/

const initKafka = async () => {

  try {

    // Create topics

    await createTopics();

    // Connect producer

    await producer.connect();

    console.log('Kafka producer connected');

    // Connect consumer

    await consumer.connect();

    console.log('Kafka consumer connected');

    // Subscribe to topics

    for (const topic of Object.values(TOPICS)) {

      if (topic !== TOPICS.DEAD_LETTER_QUEUE) {

        await consumer.subscribe({
          topic,
          fromBeginning: false
        });
      }
    }

    console.log('Kafka consumer subscribed to topics');

  } catch (error) {

    console.error('Kafka initialization failed:', error);

    throw error;
  }
};

/*
|--------------------------------------------------------------------------
| Publish Event
|--------------------------------------------------------------------------
*/

const publishEvent = async (topic, payload) => {

  if (process.env.KAFKA_ENABLED === 'false') {
    return;
  }

  try {

    await producer.send({

      topic,

      messages: [
        {
          key: payload.key || null,

          value: JSON.stringify({

            eventType: payload.eventType,

            timestamp: new Date().toISOString(),

            data: payload.data
          })
        }
      ]
    });

    console.log(`Event published to ${topic}`);

  } catch (error) {

    console.error(
      `Failed to publish event to ${topic}:`,
      error
    );

    throw error;
  }
};

/*
|--------------------------------------------------------------------------
| Consume Events
|--------------------------------------------------------------------------
*/

const consumeEvents = async (handler) => {

  try {

    await consumer.run({

      eachMessage: async ({
        topic,
        partition,
        message
      }) => {

        try {

          const event = JSON.parse(
            message.value.toString()
          );

          console.log(
            `Received event from ${topic} [Partition ${partition}]`
          );

          await handler(topic, event);

        } catch (error) {

          console.error(
            `Error processing message from ${topic}:`,
            error
          );

          // Send failed event to DLQ

          await publishEvent(
            TOPICS.DEAD_LETTER_QUEUE,
            {
              eventType: 'PROCESSING_FAILED',

              data: {
                topic,
                error: error.message,
                rawMessage: message.value.toString()
              }
            }
          );
        }
      }
    });

  } catch (error) {

    console.error('Consumer error:', error);

    throw error;
  }
};

/*
|--------------------------------------------------------------------------
| Event Handler
|--------------------------------------------------------------------------
*/

const eventHandler = async (topic, event) => {

  switch (topic) {

    case TOPICS.ORDER_EVENTS:

      console.log(
        'Processing ORDER EVENT:',
        event
      );

      break;

    case TOPICS.PAYMENT_EVENTS:

      console.log(
        'Processing PAYMENT EVENT:',
        event
      );

      break;

    case TOPICS.NOTIFICATIONS:

      console.log(
        'Processing NOTIFICATION EVENT:',
        event
      );

      break;

    case TOPICS.DELIVERY_TRACKING:

      console.log(
        'Processing DELIVERY EVENT:',
        event
      );

      break;

    case TOPICS.INVENTORY_UPDATES:

      console.log(
        'Processing INVENTORY EVENT:',
        event
      );

      break;

    case TOPICS.ANALYTICS:

      console.log(
        'Processing ANALYTICS EVENT:',
        event
      );

      break;

    default:

      console.log(
        `Unhandled topic: ${topic}`
      );
  }
};

/*
|--------------------------------------------------------------------------
| Graceful Shutdown
|--------------------------------------------------------------------------
*/

const disconnectKafka = async () => {

  try {

    await producer.disconnect();

    await consumer.disconnect();

    console.log('Kafka connections closed');

  } catch (error) {

    console.error(
      'Error disconnecting Kafka:',
      error
    );
  }
};

/*
|--------------------------------------------------------------------------
| Export
|--------------------------------------------------------------------------
*/

module.exports = {
  kafka,
  admin,
  producer,
  consumer,
  TOPICS,
  initKafka,
  publishEvent,
  consumeEvents,
  disconnectKafka
};