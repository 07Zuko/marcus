/**
 * Service Registry
 * Manages all specialized AI services and helps route requests
 */
class ServiceRegistry {
  constructor() {
    this.services = [];
  }

  /**
   * Register a new service
   * @param {BaseService} service - Service to register
   */
  registerService(service) {
    this.services.push(service);
    console.log(`Registered service: ${service.getName()}`);
  }

  /**
   * Find a service that can handle this request
   * @param {Array} messages - Message history
   * @returns {Promise<BaseService|null>} - Service that can handle the request, or null
   */
  async findService(messages) {
    for (const service of this.services) {
      try {
        const canHandle = await service.canHandle(messages);
        if (canHandle) {
          console.log(`Service ${service.getName()} can handle the request`);
          return service;
        }
      } catch (error) {
        console.error(`Error checking if service ${service.getName()} can handle request:`, error);
      }
    }
    console.log('No specialized service found for this request');
    return null;
  }

  /**
   * Get all registered services
   * @returns {Array} - List of all registered services
   */
  getServices() {
    return this.services;
  }
}

module.exports = ServiceRegistry;