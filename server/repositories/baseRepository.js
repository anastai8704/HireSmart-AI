const AppError = require("../utils/AppError");
class TenantRepository {
    constructor(Model) { this.Model = Model; }
    assertOrganization(organizationId) {
        if (!organizationId) throw new AppError("Organization scope is required", 500, "TENANT_SCOPE_MISSING");
    }
    findById(organizationId, id, projection) {
        this.assertOrganization(organizationId);
        return this.Model.findOne({ _id: id, organization: organizationId }, projection);
    }
    find(organizationId, filter = {}, options = {}) {
        this.assertOrganization(organizationId);
        return this.Model.find({ ...filter, organization: organizationId }).sort(options.sort || { createdAt: -1 }).limit(options.limit || 50);
    }
    updateById(organizationId, id, update, options = {}) {
        this.assertOrganization(organizationId);
        return this.Model.findOneAndUpdate({ _id: id, organization: organizationId }, update, { new: true, runValidators: true, ...options });
    }
}
module.exports = TenantRepository;
