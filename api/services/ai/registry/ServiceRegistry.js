/**
 * Service Registry
 * Manages AI services and specialists
 */
class ServiceRegistry {
  constructor() {
    this.services = [];
    this.specialists = [];
  }

  /**
   * Register a service
   * @param {BaseService} service - Service to register
   */
  registerService(service) {
    this.services.push(service);
    console.log(`Registered service: ${service.getName()}`);
  }
  
  /**
   * Register a specialist
   * @param {DomainSpecialistBase} specialist - Specialist to register
   */
  registerSpecialist(specialist) {
    this.specialists.push(specialist);
    console.log(`Registered specialist: ${specialist.getName()}`);
  }

  /**
   * Find a service that can handle a conversation
   * @param {Array} messages - Message history
   * @returns {Promise<BaseService|null>} - Service or null
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
   * Find specialists for a specific intent
   * @param {string} intent - Intent to match
   * @returns {Array} - List of matching specialists
   */
  findSpecialistsForIntent(intent) {
    return this.specialists.filter(specialist => specialist.handlesIntent(intent));
  }

  /**
   * Get all registered services
   * @returns {Array} - List of services
   */
  getServices() {
    return this.services;
  }
  
  /**
   * Get all registered specialists
   * @returns {Array} - List of specialists
   */
  getSpecialists() {
    return this.specialists;
  }
}

module.exports = ServiceRegistry;