(() => {
  const helpers = window.YHireBookmarkletHelpers || {};

  helpers.sleep = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  helpers.normalizeText = (value) =>
    (value || "")
      .replace(/\s+/g, " ")
      .replace(/\u00a0/g, " ")
      .trim();

  helpers.absoluteUrl = (value) => {
    if (!value) {
      return null;
    }

    try {
      return new URL(value, window.location.origin).href;
    } catch {
      return value;
    }
  };

  helpers.slugify = (value, fallback = "bookmarklet-export") =>
    helpers
      .normalizeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback;

  helpers.firstNonEmpty = (...values) => values.map(helpers.normalizeText).find(Boolean) || null;

  helpers.csvEscapeValue = (value) => {
    const stringValue =
      value === null || value === undefined
        ? ""
        : Array.isArray(value)
          ? value.join(" | ")
          : String(value);
    return '"' + stringValue.replace(/"/g, '""') + '"';
  };

  helpers.buildManagerEdges = (people) =>
    people
      .filter((person) => person.managerName)
      .map((person) => ({
        from: person.managerName,
        to: person.name,
        type: "manager"
      }));

  window.YHireBookmarkletHelpers = helpers;
})();

(async () => {
  const {
    absoluteUrl,
    buildManagerEdges,
    csvEscapeValue,
    firstNonEmpty,
    normalizeText,
    sleep,
    slugify
  } = window.YHireBookmarkletHelpers;

  const parseProfileHandleFromUrn = (urn) => {
    const match = /\(([^,]+),/.exec(urn || "");
    return match ? match[1] : null;
  };

  const parseManagerName = (cell) => {
    const labeled = cell.querySelector("[aria-label]");
    const ariaLabel = labeled ? labeled.getAttribute("aria-label") : "";
    const labelMatch = /Manager\s+(.+?)\.?$/.exec(ariaLabel || "");

    if (labelMatch) {
      return normalizeText(labelMatch[1]);
    }

    const value = normalizeText(cell.textContent);
    if (!value || /^add$/i.test(value)) {
      return null;
    }

    return value;
  };

  const parseAssignedTo = (cell) => {
    const labeled = cell.querySelector("[aria-label]");
    const ariaLabel = labeled ? labeled.getAttribute("aria-label") : "";
    const labelMatch = /(?:Assigned to|Colleague)\s+(.+?)\.?$/.exec(ariaLabel || "");

    if (labelMatch) {
      return normalizeText(labelMatch[1]);
    }

    const value = normalizeText(cell.textContent);
    if (!value || /^add colleague$/i.test(value)) {
      return null;
    }

    return value;
  };

  const parseHighlight = (cell) => {
    const emptyState = normalizeText(cell.querySelector("._no-highlight_jan5sy")?.textContent);
    if (emptyState) {
      return null;
    }

    const headline = normalizeText(
      cell.querySelector("._spotlight-card_jan5sy ._sizeSmall_1e5nen")?.textContent
    );
    const textNode = cell.querySelector("._spotlight-card_jan5sy ._subhead_1mz7um [title]");
    const body = normalizeText(textNode?.getAttribute("title") || textNode?.textContent);

    if (!headline && !body) {
      return null;
    }

    return {
      headline: headline || null,
      text: body || null
    };
  };

  const parseNotes = (cell) => {
    const button = cell.querySelector("button");
    const value = normalizeText(button?.textContent);

    if (!value || /^add note$/i.test(value)) {
      return null;
    }

    return value;
  };

  const parseRelationshipStrength = (cell) => {
    const value = normalizeText(cell.querySelector("button ._text_ddl063")?.textContent);
    if (!value || /^add$/i.test(value)) {
      return null;
    }

    return value;
  };

  const parseRole = (cell) => {
    const value = normalizeText(cell.querySelector("button ._text_ddl063")?.textContent);
    if (!value) {
      return null;
    }

    return value;
  };

  const parseMaps = (cell) =>
    Array.from(cell.querySelectorAll("._map-name-tag_6t68w0"))
      .map((node) => normalizeText(node.textContent))
      .filter(Boolean);

  const parseCrmStatus = (cell) => {
    const crmButton = cell.querySelector("[data-x-crm-badge]");
    const label = crmButton ? crmButton.getAttribute("aria-label") : "";
    const match = /,\s*([^,]+)$/.exec(label || "");
    return match ? normalizeText(match[1]) : null;
  };

  const parseConnectionDegree = (cell) => {
    const degree = cell.querySelector("._degree_d4r7xm");
    return normalizeText(degree?.textContent) || null;
  };

  const parseProfileImage = (cell) => {
    const image = cell.querySelector("[data-anonymize='headshot-photo']");
    const src = image ? image.getAttribute("src") : "";

    if (!src || /^data:image\/gif/i.test(src)) {
      return null;
    }

    return src;
  };

  const parseProfileData = (row) => {
    const peopleCell = row.querySelector("td");
    const nameLink = peopleCell?.querySelector("a[data-anonymize='person-name']");
    const name = normalizeText(nameLink?.textContent);
    const profileUrl = absoluteUrl(nameLink?.getAttribute("href"));
    const profileUrn = peopleCell
      ?.querySelector("[data-people-picker-dialog]")
      ?.getAttribute("data-people-picker-dialog");
    const treeMarkers = peopleCell?.querySelectorAll(
      ".flex.align-items-center > ._indentation_mqtpmr"
    ).length;

    return {
      name: name || null,
      profileUrl,
      profileUrn: profileUrn || null,
      profileHandle: parseProfileHandleFromUrn(profileUrn),
      profileImageUrl: parseProfileImage(peopleCell),
      connectionDegree: parseConnectionDegree(peopleCell),
      crmStatus: parseCrmStatus(peopleCell),
      title:
        normalizeText(peopleCell?.querySelector("[data-anonymize='job-title']")?.textContent) ||
        null,
      treeMarkers: Number.isFinite(treeMarkers) ? treeMarkers : 0
    };
  };

  const parseRow = (row, index) => {
    const cells = row.querySelectorAll("td");
    const people = parseProfileData(row);
    const relationshipMapCell = cells[1];
    const spotlightCell = cells[2];
    const managerCell = cells[3];
    const roleCell = cells[4];
    const strengthCell = cells[5];
    const assignToCell = cells[6];
    const notesCell = cells[7];

    return {
      index,
      ...people,
      mapNames: parseMaps(relationshipMapCell),
      highlight: parseHighlight(spotlightCell),
      managerName: parseManagerName(managerCell),
      role: parseRole(roleCell),
      relationshipStrength: parseRelationshipStrength(strengthCell),
      assignedTo: parseAssignedTo(assignToCell),
      notes: parseNotes(notesCell)
    };
  };

  const parseMapMetadata = (section) => {
    const trigger = section.querySelector("[data-x--select-relationship-map-trigger]");
    const mapName = normalizeText(trigger?.querySelector("._map-name_xfp837")?.textContent);
    const label = trigger ? trigger.getAttribute("aria-label") : "";
    const countMatch = /count\s+(\d+)/i.exec(label || "");

    return {
      name: mapName || null,
      count: countMatch ? Number(countMatch[1]) : null
    };
  };

  const parseAccountMetadata = () => {
    const titleName = normalizeText(document.title.replace(/\|\s*Sales Navigator\s*$/i, ""));
    const accountLink = Array.from(document.querySelectorAll("a[href*='/sales/company/']")).find(
      (link) => /view account for/i.test(link.getAttribute("aria-label") || link.textContent || "")
    );
    const accountLabel = accountLink?.getAttribute("aria-label") || accountLink?.textContent || "";
    const accountLabelMatch = /view account for\s+(.+)$/i.exec(accountLabel);
    let accountName = firstNonEmpty(
  accountLabelMatch?.[1],
  document.querySelector("[data-anonymize='company-name']")?.textContent,
  titleName
);

accountName = accountName
  ?.replace(/\s*Exclude\/Out CRM\s*$/i, "")
  ?.trim();

    const accountIndustry = firstNonEmpty(
      document.querySelector("[data-anonymize='industry']")?.textContent
    );

    const accountUrl = accountLink
      ? absoluteUrl(accountLink.getAttribute("href"))
      : /\/sales\/company\//.test(window.location.pathname)
        ? window.location.href
        : null;
    const accountIdMatch = /\/sales\/company\/(\d+)/.exec(accountUrl || window.location.pathname);

    return {
      name: accountName,
      industry: accountIndustry,
      url: accountUrl,
      id: accountIdMatch ? accountIdMatch[1] : null
    };
  };

  const rowsFromTable = (section) =>
    Array.from(
      section.querySelectorAll("tbody tr[id^='drag-sort-table-item-'], tbody tr._row_lm059n")
    );

  const ensureListView = async (section) => {
    if (rowsFromTable(section).length > 0) {
      return;
    }

    const listInput = section.querySelector("input[name='map-view-choice'][value='LIST']");
    const listLabel = listInput ? section.querySelector("label[for='" + listInput.id + "']") : null;

    if (listLabel) {
      listLabel.click();
    } else if (listInput) {
      listInput.click();
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (rowsFromTable(section).length > 0) {
        return;
      }
      await sleep(250);
    }
  };

  const collectAllRows = async (section) => {
    const container =
      section.querySelector("#relationship-map-list-view-scrollable") ||
      section.querySelector(".models-table-wrapper") ||
      section;
    const seen = new Map();
    let previousCount = -1;
    let stagnantPasses = 0;

    for (let pass = 0; pass < 60; pass += 1) {
      rowsFromTable(section).forEach((row, index) => {
        const item = parseRow(row, index);
        const key = item.profileUrn || item.profileUrl || item.name || "row-" + index;
        seen.set(key, item);
      });

      if (container.scrollHeight <= container.clientHeight) {
        break;
      }

      const nextTop = Math.min(
        container.scrollTop + Math.max(container.clientHeight - 40, 120),
        container.scrollHeight - container.clientHeight
      );

      if (nextTop === container.scrollTop) {
        stagnantPasses += 1;
      } else {
        container.scrollTop = nextTop;
        container.dispatchEvent(new Event("scroll", { bubbles: true }));
      }

      await sleep(250);

      if (seen.size === previousCount) {
        stagnantPasses += 1;
      } else {
        stagnantPasses = 0;
      }

      previousCount = seen.size;

      if (stagnantPasses >= 3) {
        break;
      }
    }

    container.scrollTop = 0;

    return Array.from(seen.values());
  };

  const buildEdges = buildManagerEdges;

  const toCsv = (people) => {
    const columns = [
      "index",
      "name",
      "companyName",
      "companyIndustry",
      "companyUrl",
      "companyId",
      "profileUrl",
      "profileUrn",
      "profileHandle",
      "profileImageUrl",
      "connectionDegree",
      "crmStatus",
      "title",
      "treeMarkers",
      "mapNames",
      "highlightHeadline",
      "highlightText",
      "managerName",
      "role",
      "relationshipStrength",
      "assignedTo",
      "notes"
    ];

    const rows = people.map((person) => [
      person.index,
      person.name,
      person.companyName,
      person.companyIndustry,
      person.companyUrl,
      person.companyId,
      person.profileUrl,
      person.profileUrn,
      person.profileHandle,
      person.profileImageUrl,
      person.connectionDegree,
      person.crmStatus,
      person.title,
      person.treeMarkers,
      person.mapNames,
      person.highlight?.headline || "",
      person.highlight?.text || "",
      person.managerName,
      person.role,
      person.relationshipStrength,
      person.assignedTo,
      person.notes
    ]);

    return [columns, ...rows].map((row) => row.map(csvEscapeValue).join(",")).join("\n");
  };

  const downloadFile = (filename, contents, type) => {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  };

  const copyToClipboard = async (text) => {
    if (!navigator.clipboard?.writeText) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const section =
    document.querySelector("#relationship-map[data-x--relationship-map-section]") ||
    document.querySelector("[data-x--relationship-map-section]");

  if (!section) {
    alert("Relationship map section not found on this page.");
    return;
  }

  await ensureListView(section);

  const people = await collectAllRows(section);
  if (people.length === 0) {
    alert("No relationship map rows were found.");
    return;
  }

  const account = parseAccountMetadata();
  const peopleWithAccount = people.map((person) => ({
    ...person,
    companyName: account.name,
    companyIndustry: account.industry,
    companyUrl: account.url,
    companyId: account.id
  }));
  const map = parseMapMetadata(section);
  const extractedAt = new Date().toISOString();
  const payload = {
    extractedAt,
    sourceUrl: window.location.href,
    account,
    map,
    totalPeople: peopleWithAccount.length,
    people: peopleWithAccount,
    edges: buildEdges(peopleWithAccount)
  };
  const json = JSON.stringify(payload, null, 2);
  const csv = toCsv(peopleWithAccount);
  const stamp = extractedAt.replace(/[:.]/g, "-");
  const prefix = slugify(map.name, "relationship-map");

  downloadFile(prefix + "-" + stamp + ".json", json, "application/json;charset=utf-8");
  downloadFile(prefix + "-" + stamp + ".csv", csv, "text/csv;charset=utf-8");

  const copied = await copyToClipboard(json);
  console.log("Relationship map export", payload);
  alert(
    "Exported " +
      peopleWithAccount.length +
      " relationship map rows." +
      (copied ? " JSON was also copied to the clipboard." : " JSON download completed.")
  );
})();
