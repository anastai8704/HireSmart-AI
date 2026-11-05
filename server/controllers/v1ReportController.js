// Report endpoints (Phase 10). Authorisation happens in the routes (requirePlatformAdmin / requireOrganization) and
// again here by audience, so a company member can never reach a platform-only report.
const mongoose = require("mongoose");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const { reportFor, runReport, toCsv } = require("../services/reportService");
const { audit } = require("../services/auditService");

const FORMATS = new Set(["json", "csv"]);

const parseFormat = (value) => {
  const format = value || "json";
  if (!FORMATS.has(format)) throw new AppError("format must be json or csv", 422, "VALIDATION_ERROR");
  return format;
};

const send = async (req, res, scope, organizationId = null) => {
  const type = req.params.reportType;
  const format = parseFormat(req.query.format);
  const report = await runReport({ type, scope, query: req.query });

  if (format === "csv") {
    // Every CSV export is recorded: who took which company or platform data, for which dates, and how many rows.
    await audit({
      req,
      organization: organizationId,
      action: "report.exported",
      resourceType: "report",
      resourceId: type,
      metadata: { format, audience: scope.audience, range: report.range, rowCount: report.rows.length },
    });
    const filename = `hiresmart-${type}-${report.range.from}-to-${report.range.to}.csv`;
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="${filename}"`);
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("X-Report-Timezone", report.timezone);
    return res.send(toCsv(report.columns, report.rows));
  }

  res.set("Cache-Control", "no-store");
  return res.json({
    data: {
      type: report.type,
      label: report.label,
      range: report.range,
      timezone: report.timezone,
      generatedAt: report.generatedAt,
      columns: report.columns,
      rows: report.rows,
    },
  });
};

// GET /admin/reports/:reportType (platform administrators; /admin is already gated by requirePlatformAdmin)
exports.adminReport = asyncHandler(async (req, res) => {
  if (req.auth.platformRole !== "platform_admin") throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  if (!reportFor(req.params.reportType, "admin")) throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  await send(req, res, { audience: "admin" });
});

// GET /organizations/:organizationId/reports/:reportType (members with analytics.read; company-scoped reports only)
exports.organizationReport = asyncHandler(async (req, res) => {
  const { organizationId } = req.params;
  if (!mongoose.isValidObjectId(organizationId)) throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  if (!reportFor(req.params.reportType, "organization")) throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  await send(req, res, { audience: "organization", organizationId: String(organizationId) }, String(organizationId));
});
