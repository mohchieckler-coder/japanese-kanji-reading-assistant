"use strict";

module.exports = {
  join(base, ...parts) {
    const normalizedBase = String(base).replace(/[\\/]+$/, "");
    const suffix = parts
      .map((part) => String(part).replace(/^[\\/]+|[\\/]+$/g, ""))
      .filter(Boolean)
      .join("/");
    return suffix ? `${normalizedBase}/${suffix}` : normalizedBase;
  }
};
