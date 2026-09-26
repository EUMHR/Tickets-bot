function getSupportRoleIds(panel) {
  const configured = Array.isArray(panel?.supportRoleIds)
    ? panel.supportRoleIds
    : String(panel?.supportRoleId || '').split(/[\s,]+/).filter(Boolean);
  const fallback = [process.env.SUPPORT_ROLE_IDS, process.env.SUPPORT_ROLE_ID]
    .filter(Boolean)
    .flatMap((value) => String(value).split(/[\s,]+/));
  const roles = configured.length ? configured : fallback;
  return [...new Set(roles.map((roleId) => String(roleId).trim()).filter((roleId) => /^\d{17,20}$/.test(roleId)))];
}

module.exports = { getSupportRoleIds };
