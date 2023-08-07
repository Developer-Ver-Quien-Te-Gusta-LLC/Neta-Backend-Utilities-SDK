import Mixpanel from 'mixpanel';
var mixpanel = Mixpanel.init("9ecd22e50f6805adb3e4df907baf149a"); /// USE AWS KMS

async function SendEvent(event_name, phoneNumber,value) {
  mixpanel.track(event_name, {
    distinct_id: phoneNumber,
    value //TODO : fetch all values from 'value' and add them to this json , also support multiple types of values 

  });
}

export { SendEvent };