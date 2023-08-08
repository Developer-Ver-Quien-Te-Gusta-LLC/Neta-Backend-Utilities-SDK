import Mixpanel from 'mixpanel';
import FetchFromSecrets from './AwsSecrets'

let mixpanel;
async function init () {
  mixpanel = Mixpanel.init(await FetchFromSecrets("MixpanelClientSecret")); // NOTE: Store this securely
}
init()

async function SendEvent(event_name, phoneNumber, value, time) {
  const eventData = {
    distinct_id: phoneNumber,
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

export { SendEvent };
