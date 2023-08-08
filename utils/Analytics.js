const Mixpanel = require('mixpanel');
const { v4: uuidv4 } = require('uuid');
const FetchFromSecrets = require('./AwsSecrets').FetchFromSecrets;

let mixpanel;
async function init () {
  //mixpanel = Mixpanel.init(await FetchFromSecrets("MixpanelClientSecret")); // NOTE: Store this securely
}
init()

async function SendEvent(event_name, phoneNumber, value, time) {
  const eventData = {
    distinct_id: !phoneNumber ? uuidv4() : phoneNumber,
    ...value
  };

  mixpanel.import(event_name, time, eventData, (err) => {
    if (err) {
      console.error('Failed to send event:', err);
    } else {
      console.log('Event sent successfully!');
    }
  });
}

module.exports = { SendEvent };
