const {FetchFromSecrets} = require ('./AwsSecrets')

const tracer = require('dd-trace').init({
    service: FetchFromSecrets('Datadog-service'),
    env: FetchFromSecrets('Datadog-env'),
    logInjection: true,
    analytics: true,
    apiKey: FetchFromSecrets('Datadog-apiKey') // Using environment variable for security
  });
  
  /**
   * Middleware to measure compute length of routes.
   */
  const measureRouteComputeLength = (req, res, next) => {
    const span = tracer.startSpan('http.request');
    
    res.on('finish', () => {
      span.setTag('http.status_code', res.statusCode);
      span.finish();
    });
    
    next();
  };
  
  /**
   * Middleware to sanitize and log the req object.
   */
  const logSanitizedRequest = (req, res, next) => {
    const sanitizedReq = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      // Add other properties you want to log
    };
    
    console.log('Sanitized Request:', sanitizedReq);
    
    next();
  };
  
  module.exports = {
    measureRouteComputeLength,
    logSanitizedRequest
  };
  