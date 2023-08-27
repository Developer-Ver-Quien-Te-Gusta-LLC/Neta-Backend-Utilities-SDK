const AWSXRay = require('aws-xray-sdk-core');

// Initialize AWS X-Ray
AWSXRay.config([AWSXRay.plugins.EC2Plugin, AWSXRay.plugins.ECSPlugin]);
AWSXRay.setContextMissingStrategy('LOG_ERROR');

/**
 * Middleware to measure compute length of routes using AWS X-Ray.
 */
const measureRouteComputeLength = (req, res, next) => {
  const name = AWSXRay.middleware.resolveName(req.headers.host || 'unknown-host');
  const segment = new AWSXRay.Segment('http.request', null, name);
  AWSXRay.middleware.setSegment(req, segment);

  res.on('finish', () => {
    segment.addMetadata('http_status_code', res.statusCode);
    segment.close();
  });

  next();
};

/**
 * Middleware to capture and log the req object in an AWS X-Ray friendly way.
 */
const logSanitizedRequest = (req, res, next) => {
  const sanitizedReq = {
    method: req.method,
    url: req.url,
    headers: req.headers,
    // Add other properties you want to log
  };

  // Capture the sanitized request in X-Ray
  const subsegment = AWSXRay.getSegment().addNewSubsegment('logSanitizedRequest');
  subsegment.addAnnotation('SanitizedRequest', JSON.stringify(sanitizedReq));
  subsegment.close();

  console.log('Sanitized Request:', sanitizedReq);

  next();
};

module.exports = {
  measureRouteComputeLength,
  logSanitizedRequest
};
