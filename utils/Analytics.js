const Mixpanel = require('mixpanel');
const { v4: uuidv4 } = require('uuid');
const FetchFromSecrets = require('./AwsSecrets').FetchFromSecrets;

let mixpanel;
async function init () {
  mixpanel = Mixpanel.init(await FetchFromSecrets("MixpanelClientSecret")); // NOTE: Store this securely
}
init()

async function SendEvent(event_name, phoneNumber, value, time) {
  const eventData = {
    distinct_id: !phoneNumber ? uuidv4() : phoneNumber,
    ...value
  };

  if (mixpanel) {
    mixpanel.track(event_name, eventData, (err) => {
      if (err) {
        console.error('Failed to send event:', err);
      }
    });
  } else {
    console.log('Mixpanel not initialized');
  }
}

//SendEvent("AAA","+8989830517","Ookokok",null);

module.exports = { SendEvent };
