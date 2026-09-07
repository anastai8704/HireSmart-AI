const { Membership } = require("../models/Membership");

/**
 * The active owner of an organization: { id, name } or null.
 * Shared by the recruitment, organization and invitation controllers so
 * company-level notifications always go to the right person.
 */
const organizationOwner = async (organizationId) => {
  if (!organizationId) return null;
  const owner = await Membership.findOne({
    organization: organizationId,
    role: "owner",
    status: "active",
  })
    .select("user")
    .populate({ path: "user", select: "name" });
  if (!owner || !owner.user) return null;
  return { id: owner.user._id, name: owner.user.name };
};

module.exports = organizationOwner;
