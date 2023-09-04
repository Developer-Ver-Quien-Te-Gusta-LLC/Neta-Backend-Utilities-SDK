const AWSXRay = require('aws-xray-sdk-core');
const expressMiddleware = AWSXRay.express;

// Initialize AWS X-Ray
AWSXRay.config([AWSXRay.plugins.EC2Plugin, AWSXRay.plugins.ECSPlugin]);
AWSXRay.setContextMissingStrategy('LOG_ERROR');

/**
 * Middleware to measure compute length of routes using AWS X-Ray.
 */
const measureRouteComputeLength = (req, res, next) => {
  const segment = AWSXRay.getSegment();
  if (segment) {
      res.on('finish', () => {
          segment.addMetadata('http_status_code', res.statusCode);
      });
  }
  next();
};

const logSanitizedRequest = (req, res, next) => {
  const sanitizedReq = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      // Add other properties you want to log
  };

  // Capture the sanitized request in X-Ray
  const segment = AWSXRay.getSegment();
  if (segment) {
      const subsegment = segment.addNewSubsegment('logSanitizedRequest');
      subsegment.addAnnotation('SanitizedRequest', JSON.stringify(sanitizedReq));
      subsegment.close();
  }

  console.log('Sanitized Request:', sanitizedReq);

  next();
};


module.exports = {
  measureRouteComputeLength,
  logSanitizedRequest
};
