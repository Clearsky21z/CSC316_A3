const DATA_URL = "data/leverkusen_progression_2023_24.json";

const COLORS = {
  accent: "#f4c65c",
  gold: "#f4c65c",
  secondary: "#64dfc7",
  highlight: "#ff5a37",
  miss: "#ff8678",
  neutral: "rgba(245, 234, 217, 0.18)",
  textSoft: "#c9bca9",
  fieldFill: "#0c342a",
  fieldStripe: "rgba(255, 255, 255, 0.03)",
  fieldLine: "rgba(248, 239, 225, 0.94)",
};

const PASS_TYPES = [
  { value: "all", label: "All passes", accent: "#f5c44a", predicate: () => true },
  {
    value: "progressive",
    label: "Forward passes",
    accent: "#f5c44a",
    predicate: (pass) => pass.progressive,
  },
  {
    value: "final_third",
    label: "Into the attacking third",
    accent: "#6ed1c5",
    predicate: (pass) => pass.final_third_entry,
  },
  {
    value: "box",
    label: "Into the penalty area",
    accent: "#f15a29",
    predicate: (pass) => pass.box_entry,
  },
  {
    value: "switch",
    label: "Cross-field passes",
    accent: "#ff9b54",
    predicate: (pass) => pass.switch,
  },
  {
    value: "shot_assist",
    label: "Passes before a shot",
    accent: "#9adbc9",
    predicate: (pass) => pass.shot_assist,
  },
];

const PHASES = [
  { value: "open", label: "Regular play only" },
  { value: "all", label: "All situations" },
];

const OUTCOMES = [
  { value: "complete", label: "Successful only" },
  { value: "all", label: "Successful + unsuccessful" },
];

const PLAYER_SPOTLIGHT_CONFIGS = [
  {
    id: "xhaka-orchestrator",
    player: "Granit Xhaka",
    title: "Granit Xhaka",
    kicker: "Midfield organizer",
    image: "assets/xhaka.webp",
    passType: "progressive",
    metricKey: "progressive",
    metricLabel: "successful forward passes",
    description:
      "A season-long view of the midfielder who most often moved Leverkusen into better positions.",
  },
  {
    id: "wirtz-creator",
    player: "Florian Wirtz",
    title: "Florian Wirtz",
    kicker: "Creative hub",
    image: "assets/wirtz.webp",
    passType: "shot_assist",
    metricKey: "shot_assist",
    metricLabel: "passes before a shot",
    description:
      "Shows the attacker most often involved in the final pass before Leverkusen created a shot.",
  },
  {
    id: "grimaldo-supplier",
    player: "Alejandro Grimaldo García",
    title: "Alejandro Grimaldo",
    kicker: "Wide playmaker",
    image: "assets/grimaldo.png",
    passType: "box",
    metricKey: "box_entry",
    metricLabel: "successful passes into the penalty area",
    description:
      "Highlights the left-sided creator who repeatedly delivered the ball into dangerous spaces near goal.",
  },
];

const PASS_TYPE_MAP = new Map(PASS_TYPES.map((item) => [item.value, item]));
const FORMAT_INT = d3.format(",");
const FORMAT_ONE_DECIMAL = d3.format(".1f");
const LEVERKUSEN_LOGO_URL = "assets/leverkusen-logo.png";
const SEASON_AUTOPLAY_INTERVAL = 720;

let app;
let dom;
let state;
let seasonAutoplayTimer = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const raw = await d3.json(DATA_URL);
  const passes = raw.passes.map((row) => hydrateRow(raw.pass_fields, row));
  const matchesById = new Map(raw.matches.map((match) => [match.match_id, match]));
  const passesById = new Map(passes.map((pass) => [pass.id, pass]));
  const sequences = d3.group(passes, (pass) => pass.sequence_key);
  const maxMinute = Math.ceil(d3.max(passes, (pass) => pass.clock_minute));

  app = {
    ...raw,
    passes,
    matchesById,
    passesById,
    sequences,
    maxMinute,
    spotlightStories: buildPlayerSpotlights(passes),
  };

  dom = bindDom();
  state = {
    ...raw.default_state,
    minute_range: [0, maxMinute],
    selected_pass_id: null,
    active_story_id: null,
    season_autoplay: false,
    season_autoplay_index: null,
  };

  populateControls();
  renderHeroMetrics();
  renderStories();
  bindEvents();
  update();
}

function hydrateRow(fields, row) {
  const output = {};
  fields.forEach((field, index) => {
    output[field] = row[index];
  });
  return output;
}

function bindDom() {
  return {
    heroMetrics: document.querySelector("#hero-metrics"),
    seasonChart: document.querySelector("#season-chart"),
    seasonAutoplayButton: document.querySelector("#season-autoplay"),
    seasonRoundInput: document.querySelector("#season-round"),
    seasonRoundValue: document.querySelector("#season-round-value"),
    storyGrid: document.querySelector("#story-grid"),
    matchSelect: document.querySelector("#match-select"),
    playerSelect: document.querySelector("#player-select"),
    passTypeSelect: document.querySelector("#pass-type-select"),
    phaseSelect: document.querySelector("#phase-select"),
    outcomeSelect: document.querySelector("#outcome-select"),
    resetFiltersButton: document.querySelector("#reset-filters"),
    clearBrushButton: document.querySelector("#clear-brush"),
    clearSequenceButton: document.querySelector("#clear-sequence"),
    selectionCaption: document.querySelector("#selection-caption"),
    renderNote: document.querySelector("#render-note"),
    selectionMetrics: document.querySelector("#selection-metrics"),
    pitchLegend: document.querySelector("#pitch-legend"),
    pitchChart: document.querySelector("#pitch-chart"),
    rankingChart: document.querySelector("#ranking-chart"),
    sequenceChart: document.querySelector("#sequence-chart"),
    sequenceIntro: document.querySelector("#sequence-intro"),
    sequenceMeta: document.querySelector("#sequence-meta"),
    timelineChart: document.querySelector("#timeline-chart"),
    tooltip: document.querySelector("#tooltip"),
  };
}

function populateControls() {
  populateSelect(dom.matchSelect, [
    { value: "all", label: "All 34 matches" },
    ...app.matches.map((match) => ({ value: String(match.match_id), label: match.label })),
  ]);

  populateSelect(dom.playerSelect, [
    { value: "all", label: "All players" },
    ...app.players.map((player) => ({ value: player, label: player })),
  ]);

  populateSelect(
    dom.passTypeSelect,
    PASS_TYPES.map((item) => ({ value: item.value, label: item.label })),
  );

  populateSelect(
    dom.phaseSelect,
    PHASES.map((item) => ({ value: item.value, label: item.label })),
  );

  populateSelect(
    dom.outcomeSelect,
    OUTCOMES.map((item) => ({ value: item.value, label: item.label })),
  );

  syncControlsToState();
}

function populateSelect(select, options) {
  select.innerHTML = "";
  options.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    select.append(element);
  });
}

function syncControlsToState() {
  dom.matchSelect.value = String(state.match_id);
  dom.playerSelect.value = state.player;
  dom.passTypeSelect.value = state.pass_type;
  dom.phaseSelect.value = state.phase;
  dom.outcomeSelect.value = state.outcome;
}

function bindEvents() {
  dom.seasonAutoplayButton.addEventListener("click", () => {
    if (state.season_autoplay) {
      stopSeasonAutoplay({ clearCursor: false });
      update();
    } else {
      startSeasonAutoplay();
    }
  });

  dom.seasonRoundInput.addEventListener("input", () => {
    stopSeasonAutoplay({ clearCursor: false });
    setSeasonRound(Number(dom.seasonRoundInput.value) - 1);
  });

  dom.matchSelect.addEventListener("change", () => {
    stopSeasonAutoplay();
    state.match_id = dom.matchSelect.value === "all" ? "all" : Number(dom.matchSelect.value);
    clearStoryAndSelection();
    update();
  });

  dom.playerSelect.addEventListener("change", () => {
    stopSeasonAutoplay();
    state.player = dom.playerSelect.value;
    state.selected_pass_id = null;
    state.active_story_id = null;
    update();
  });

  dom.passTypeSelect.addEventListener("change", () => {
    stopSeasonAutoplay();
    state.pass_type = dom.passTypeSelect.value;
    clearStoryAndSelection();
    update();
  });

  dom.phaseSelect.addEventListener("change", () => {
    stopSeasonAutoplay();
    state.phase = dom.phaseSelect.value;
    clearStoryAndSelection();
    update();
  });

  dom.outcomeSelect.addEventListener("change", () => {
    stopSeasonAutoplay();
    state.outcome = dom.outcomeSelect.value;
    clearStoryAndSelection();
    update();
  });

  dom.resetFiltersButton.addEventListener("click", () => {
    stopSeasonAutoplay();
    state = {
      ...state,
      match_id: "all",
      player: "all",
      pass_type: "progressive",
      phase: "open",
      outcome: "complete",
      minute_range: [0, app.maxMinute],
      selected_pass_id: null,
      active_story_id: null,
    };
    syncControlsToState();
    update();
  });

  dom.clearBrushButton.addEventListener("click", () => {
    stopSeasonAutoplay();
    state.minute_range = [0, app.maxMinute];
    state.active_story_id = null;
    update();
  });

  dom.clearSequenceButton.addEventListener("click", () => {
    stopSeasonAutoplay();
    state.selected_pass_id = null;
    state.active_story_id = null;
    update();
  });
}

function clearStoryAndSelection() {
  state.selected_pass_id = null;
  state.active_story_id = null;
}

function renderHeroMetrics() {
  dom.heroMetrics.innerHTML = `
    <article class="hero-metric hero-record-card hero-record-display">
      <p class="hero-record-line">
        <span class="hero-record-value">${FORMAT_INT(app.summary.wins)}</span>
        <span class="hero-record-word">WIN</span>
      </p>
      <p class="hero-record-line">
        <span class="hero-record-value">${FORMAT_INT(app.summary.draws)}</span>
        <span class="hero-record-word">DRAW</span>
      </p>
      <p class="hero-record-line">
        <span class="hero-record-value">${FORMAT_INT(app.summary.losses)}</span>
        <span class="hero-record-word">LOSE</span>
      </p>
    </article>
  `;
}

function renderStories() {
  dom.storyGrid.innerHTML = "";
  app.spotlightStories.forEach((story) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "story-card";
    button.dataset.storyId = story.id;
    button.innerHTML = `
      <div class="story-card-top">
        <div class="story-card-copy">
          <p class="story-card-kicker">${story.kicker}</p>
          <h3>${story.title}</h3>
        </div>
        <img
          class="story-card-photo"
          src="${story.image}"
          alt="${story.title} portrait"
          loading="lazy"
        />
      </div>
    `;
    button.addEventListener("click", () => {
      stopSeasonAutoplay();
      state = {
        ...state,
        ...story.filters,
        minute_range: [...story.filters.minute_range],
        selected_pass_id: null,
        active_story_id: story.id,
      };
      syncControlsToState();
      update();
    });
    dom.storyGrid.append(button);
  });
}

function renderSeasonOverview() {
  renderSeasonChart();
}

function renderSeasonChart() {
  dom.seasonChart.innerHTML = "";
  const width = 980;
  const height = 328;
  const margin = { top: 24, right: 24, bottom: 64, left: 44 };
  const ribbonTop = height - 50;
  const ribbonHeight = 18;

  const svg = d3
    .select(dom.seasonChart)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("width", "100%")
    .style("height", "100%");

  const defs = svg.append("defs");
  defs
    .append("linearGradient")
    .attr("id", "season-line-gradient")
    .attr("x1", "0%")
    .attr("x2", "100%")
    .attr("y1", "0%")
    .attr("y2", "0%")
    .call((gradient) => {
      gradient.append("stop").attr("offset", "0%").attr("stop-color", COLORS.secondary);
      gradient.append("stop").attr("offset", "55%").attr("stop-color", COLORS.accent);
      gradient.append("stop").attr("offset", "100%").attr("stop-color", COLORS.highlight);
    });

  const x = d3
    .scalePoint()
    .domain(app.matches.map((match) => match.matchday))
    .range([margin.left, width - margin.right]);

  const y = d3
    .scaleLinear()
    .domain([0, d3.max(app.matches, (match) => match.cumulative_points) || 90])
    .nice()
    .range([ribbonTop - 28, margin.top]);

  const area = d3
    .area()
    .x((match) => x(match.matchday))
    .y0(y(0))
    .y1((match) => y(match.cumulative_points))
    .curve(d3.curveMonotoneX);

  const line = d3
    .line()
    .x((match) => x(match.matchday))
    .y((match) => y(match.cumulative_points))
    .curve(d3.curveMonotoneX);

  svg
    .append("path")
    .datum(app.matches)
    .attr("d", area)
    .attr("fill", withAlpha(COLORS.secondary, 0.12));

  svg
    .append("path")
    .datum(app.matches)
    .attr("d", line)
    .attr("fill", "none")
    .attr("stroke", "url(#season-line-gradient)")
    .attr("stroke-width", 3.2);

  svg
    .append("g")
    .call(d3.axisLeft(y).tickValues([0, 20, 40, 60, 80, 90]).tickSize(-(width - margin.left - margin.right)))
    .attr("transform", `translate(${margin.left},0)`)
    .call((axis) => axis.select(".domain").remove())
    .call((axis) => axis.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.08)"))
    .call((axis) => axis.selectAll(".tick text").attr("fill", COLORS.textSoft).attr("font-size", 12));

  svg
    .append("g")
    .selectAll("circle.season-node")
    .data(app.matches)
    .join("circle")
    .attr("cx", (match) => x(match.matchday))
    .attr("cy", (match) => y(match.cumulative_points))
    .attr("r", (match) => (state.match_id === match.match_id ? 6.8 : 4.8))
    .attr("fill", (match) => resultColor(match.result))
    .attr("stroke", "rgba(7,8,10,0.88)")
    .attr("stroke-width", 1.6)
    .style("cursor", "pointer")
    .on("mouseenter", (event, match) => showMatchTooltip(event, match))
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .on("click", (_, match) => selectMatch(match.match_id));

  if (state.season_autoplay_index !== null) {
    const activeMatch = app.matches[state.season_autoplay_index];
    const markerX = x(activeMatch.matchday);
    const markerY = y(activeMatch.cumulative_points);
    const labelWidth = 82;
    const labelOffsetX = markerX > width - 120 ? -labelWidth - 18 : 18;
    const labelOffsetY = -36;
    const markerGroup = svg
      .append("g")
      .attr("class", "season-logo-marker")
      .attr("transform", `translate(${markerX},${markerY})`)
      .style("pointer-events", "none");

    markerGroup
      .append("circle")
      .attr("r", 14)
      .attr("fill", withAlpha(COLORS.gold, 0.18))
      .attr("stroke", withAlpha(COLORS.gold, 0.35))
      .attr("stroke-width", 1.1);

    markerGroup
      .append("image")
      .attr("href", LEVERKUSEN_LOGO_URL)
      .attr("x", -10)
      .attr("y", -10)
      .attr("width", 20)
      .attr("height", 20)
      .attr("preserveAspectRatio", "xMidYMid meet");

    markerGroup
      .append("rect")
      .attr("x", labelOffsetX)
      .attr("y", labelOffsetY)
      .attr("width", labelWidth)
      .attr("height", 26)
      .attr("rx", 10)
      .attr("fill", "rgba(11, 15, 18, 0.92)")
      .attr("stroke", withAlpha(COLORS.gold, 0.3))
      .attr("stroke-width", 1);

    markerGroup
      .append("text")
      .attr("x", labelOffsetX + labelWidth / 2)
      .attr("y", labelOffsetY + 17)
      .attr("text-anchor", "middle")
      .attr("font-size", 12)
      .attr("font-weight", 700)
      .attr("font-family", "IBM Plex Mono, monospace")
      .attr("fill", COLORS.gold)
      .text(`${activeMatch.cumulative_points} PTS`);
  }

  const ribbon = svg.append("g");
  ribbon
    .selectAll("rect")
    .data(app.matches)
    .join("rect")
    .attr("x", (match) => x(match.matchday) - 11.5)
    .attr("y", ribbonTop)
    .attr("width", 23)
    .attr("height", ribbonHeight)
    .attr("rx", 5)
    .attr("fill", (match) => resultColor(match.result))
    .attr("opacity", 0.9)
    .attr("stroke", (match) =>
      state.match_id === match.match_id ? withAlpha(COLORS.gold, 0.95) : "rgba(255,255,255,0.08)",
    )
    .attr("stroke-width", (match) => (state.match_id === match.match_id ? 1.8 : 1))
    .style("cursor", "pointer")
    .on("mouseenter", (event, match) => showMatchTooltip(event, match))
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .on("click", (_, match) => selectMatch(match.match_id));

  ribbon
    .selectAll("text")
    .data(app.matches)
    .join("text")
    .attr("x", (match) => x(match.matchday))
    .attr("y", ribbonTop + 12.5)
    .attr("text-anchor", "middle")
    .attr("font-size", 10.5)
    .attr("font-weight", 800)
    .attr("fill", "#07080a")
    .text((match) => match.result);

  svg
    .append("g")
    .selectAll("text.matchday-label")
    .data(app.matches.filter((match) => match.matchday % 4 === 1 || match.matchday === 34))
    .join("text")
    .attr("x", (match) => x(match.matchday))
    .attr("y", height - 16)
    .attr("text-anchor", "middle")
    .attr("font-size", 11.5)
    .attr("fill", COLORS.textSoft)
    .text((match) => match.matchday);

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", margin.top - 8)
    .attr("font-size", 12)
    .attr("font-family", "IBM Plex Mono, monospace")
    .attr("fill", COLORS.textSoft)
    .text("Cumulative points");
}

function selectMatch(matchId) {
  stopSeasonAutoplay();
  state.match_id = state.match_id === matchId ? "all" : matchId;
  state.player = "all";
  state.minute_range = [0, app.maxMinute];
  state.selected_pass_id = null;
  state.active_story_id = null;
  syncControlsToState();
  update();
}

function update() {
  let derived = computeDerived();

  if (
    state.selected_pass_id &&
    !derived.focusedPasses.some((pass) => pass.id === state.selected_pass_id)
  ) {
    state.selected_pass_id = null;
    derived = computeDerived();
  }

  renderSeasonAutoplayButton();
  renderSeasonRoundControl();
  renderActiveStory();
  renderSeasonOverview();
  renderSelectionSummary(derived);
  renderSelectionMetrics(derived);
  renderPitchLegend(derived);
  renderPitch(derived);
  renderRanking(derived);
  renderTimeline(derived);
  renderSequence(derived);
}

function renderSeasonAutoplayButton() {
  const isPaused = !state.season_autoplay && state.season_autoplay_index !== null;
  dom.seasonAutoplayButton.textContent = state.season_autoplay
    ? "Pause Autoplay"
    : isPaused
      ? "Resume Autoplay"
      : "Autoplay Season";
  dom.seasonAutoplayButton.classList.toggle("is-running", state.season_autoplay);
  dom.seasonAutoplayButton.classList.toggle("is-paused", isPaused);
}

function renderSeasonRoundControl() {
  const index = getDisplayedSeasonIndex();
  dom.seasonRoundInput.value = String(index + 1);
  dom.seasonRoundValue.textContent = `${index + 1} / ${app.matches.length}`;
}

function startSeasonAutoplay() {
  stopSeasonAutoplay({ clearCursor: false });
  state.season_autoplay = true;
  const hasCursor = state.season_autoplay_index !== null;
  const isAtEnd = state.season_autoplay_index === app.matches.length - 1;

  if (!hasCursor || isAtEnd) {
    setSeasonRound(0, { preserveAutoplay: true });
  } else {
    update();
  }

  seasonAutoplayTimer = window.setInterval(() => {
    const nextIndex = (state.season_autoplay_index ?? -1) + 1;
    if (nextIndex >= app.matches.length) {
      stopSeasonAutoplay({ clearCursor: false });
      update();
      return;
    }
    setSeasonRound(nextIndex, { preserveAutoplay: true });
  }, SEASON_AUTOPLAY_INTERVAL);
}

function stopSeasonAutoplay({ clearCursor = true } = {}) {
  if (seasonAutoplayTimer) {
    window.clearInterval(seasonAutoplayTimer);
    seasonAutoplayTimer = null;
  }

  if (!state) {
    return;
  }

  state.season_autoplay = false;
  if (clearCursor) {
    state.season_autoplay_index = null;
  }
}

function setSeasonRound(index, { preserveAutoplay = false } = {}) {
  const match = app.matches[index];
  if (!match) {
    return;
  }

  if (!preserveAutoplay) {
    state.season_autoplay = false;
  }
  state.match_id = match.match_id;
  state.player = "all";
  state.minute_range = [0, app.maxMinute];
  state.selected_pass_id = null;
  state.active_story_id = null;
  state.season_autoplay_index = index;
  syncControlsToState();
  update();
}

function getDisplayedSeasonIndex() {
  if (state.season_autoplay_index !== null) {
    return state.season_autoplay_index;
  }
  if (state.match_id !== "all") {
    const index = app.matches.findIndex((match) => match.match_id === state.match_id);
    if (index >= 0) {
      return index;
    }
  }
  return 0;
}

function computeDerived() {
  const passType = PASS_TYPE_MAP.get(state.pass_type);
  const minuteMin = state.minute_range[0];
  const minuteMax = state.minute_range[1];

  const scopePasses = app.passes.filter((pass) => {
    if (state.match_id !== "all" && pass.match_id !== state.match_id) {
      return false;
    }
    if (state.phase === "open" && !pass.open_play) {
      return false;
    }
    if (state.outcome === "complete" && !pass.successful) {
      return false;
    }
    if (pass.clock_minute < minuteMin || pass.clock_minute > minuteMax) {
      return false;
    }
    return true;
  });

  const typedPasses = scopePasses.filter((pass) => passType.predicate(pass));
  const focusedPasses =
    state.player === "all"
      ? typedPasses
      : typedPasses.filter((pass) => pass.player === state.player);

  const uniquePossessions = new Set(focusedPasses.map((pass) => pass.sequence_key)).size;
  const boxEntryCount = focusedPasses.filter((pass) => pass.box_entry).length;
  const shotAssistCount = focusedPasses.filter((pass) => pass.shot_assist).length;
  const sampledPasses = samplePasses(
    focusedPasses,
    state.match_id === "all" ? 2200 : 3600,
    state.selected_pass_id,
  );
  const selectedPass = state.selected_pass_id ? app.passesById.get(state.selected_pass_id) : null;

  return {
    passType,
    scopePasses,
    typedPasses,
    focusedPasses,
    sampledPasses,
    uniquePossessions,
    boxEntryCount,
    shotAssistCount,
    selectedPass,
  };
}

function samplePasses(passes, limit, keepId) {
  if (passes.length <= limit) {
    return passes;
  }

  const sampled = [];
  const step = passes.length / limit;
  for (let index = 0; index < limit; index += 1) {
    sampled.push(passes[Math.floor(index * step)]);
  }

  if (keepId) {
    const kept = passes.find((pass) => pass.id === keepId);
    if (kept && !sampled.some((pass) => pass.id === keepId)) {
      sampled[sampled.length - 1] = kept;
    }
  }

  return Array.from(new Map(sampled.map((pass) => [pass.id, pass])).values());
}

function renderActiveStory() {
  dom.storyGrid.querySelectorAll(".story-card").forEach((button) => {
    button.classList.toggle("active", button.dataset.storyId === state.active_story_id);
  });
}

function renderSelectionSummary(derived) {
  const passTypeLabel = derived.passType.label.toLowerCase();
  const playerLabel = state.player === "all" ? "Leverkusen" : state.player;
  const matchLabel =
    state.match_id === "all" ? "all 34 matches" : app.matchesById.get(state.match_id).label;
  const phaseLabel = state.phase === "open" ? "regular play" : "all situations";
  const outcomeLabel = state.outcome === "complete" ? "successful " : "";
  const minuteText =
    state.minute_range[0] === 0 && state.minute_range[1] === app.maxMinute
      ? "the full match clock"
      : `minutes ${state.minute_range[0]}-${state.minute_range[1]}`;

  dom.selectionCaption.textContent = `Showing ${FORMAT_INT(
    derived.focusedPasses.length,
  )} ${outcomeLabel}${passTypeLabel} by ${playerLabel} in ${phaseLabel} across ${matchLabel}, filtered to ${minuteText}.`;

  if (derived.focusedPasses.length > derived.sampledPasses.length) {
    dom.renderNote.textContent = `Rendering ${FORMAT_INT(
      derived.sampledPasses.length,
    )} of ${FORMAT_INT(derived.focusedPasses.length)} matching passes to keep the pitch responsive.`;
  } else {
    dom.renderNote.textContent = "";
  }
}

function renderSelectionMetrics(derived) {
  const matchCount = new Set(derived.focusedPasses.map((pass) => pass.match_id)).size;

  const metrics = [
    { label: "Passes Shown", value: FORMAT_INT(derived.focusedPasses.length) },
    { label: "Matches Included", value: FORMAT_INT(matchCount) },
    { label: "Passing Moves", value: FORMAT_INT(derived.uniquePossessions) },
    {
      label: "Passes Into The Penalty Area",
      value: FORMAT_INT(derived.boxEntryCount),
      note: `${FORMAT_INT(derived.shotAssistCount)} passes before a shot in this view`,
    },
  ];

  dom.selectionMetrics.innerHTML = metrics
    .map(
      (metric) => `
        <article class="metric-card">
          <p class="metric-label">${metric.label}</p>
          <p class="metric-value">${metric.value}</p>
          <p class="metric-note">${metric.note ?? ""}</p>
        </article>
      `,
    )
    .join("");
}

function renderPitchLegend(derived) {
  const legendItems = [
    { label: derived.passType.label, color: derived.passType.accent },
    { label: "Selected sequence pass", color: COLORS.highlight },
  ];

  if (state.outcome === "all") {
    legendItems.push({ label: "Incomplete pass", color: COLORS.miss });
  }

  dom.pitchLegend.innerHTML = legendItems
    .map(
      (item) => `
        <span class="legend-item">
          <span class="legend-swatch" style="background:${item.color}"></span>
          ${item.label}
        </span>
      `,
    )
    .join("");
}

function renderPitch(derived) {
  const svg = createPitchSvg(dom.pitchChart, {
    minHeight: 620,
    title: derived.focusedPasses.length ? null : "No matching passes for the current filters.",
  });

  if (!derived.focusedPasses.length) {
    return;
  }

  appendArrowDefs(svg, derived.passType.accent);
  const passLayer = svg.append("g");
  const highlightedPass = derived.selectedPass?.id;

  const orderedPasses = [...derived.sampledPasses].sort((a, b) => {
    if (a.id === highlightedPass) return 1;
    if (b.id === highlightedPass) return -1;
    return d3.ascending(a.index, b.index);
  });

  passLayer
    .selectAll("path")
    .data(orderedPasses, (pass) => pass.id)
    .join("path")
    .attr("d", (pass) => linePath(pass))
    .attr("fill", "none")
    .attr("stroke-linecap", "round")
    .attr("stroke-width", (pass) => (pass.id === highlightedPass ? 2.2 : 1.15))
    .attr("stroke", (pass) => passStroke(pass, derived.passType.accent, highlightedPass))
    .attr("stroke-opacity", (pass) => passOpacity(pass, highlightedPass))
    .attr("marker-end", (pass) => markerForPass(pass, highlightedPass))
    .style("cursor", "pointer")
    .on("mouseenter", (event, pass) => showTooltip(event, pass))
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .on("click", (_, pass) => {
      state.selected_pass_id = pass.id;
      state.active_story_id = null;
      update();
    });

  if (derived.selectedPass) {
    const pass = derived.selectedPass;
    const highlightLayer = svg.append("g");
    highlightLayer
      .append("circle")
      .attr("cx", pass.start_x)
      .attr("cy", pass.start_y)
      .attr("r", 1.9)
      .attr("fill", COLORS.highlight);

    highlightLayer
      .append("circle")
      .attr("cx", pass.end_x)
      .attr("cy", pass.end_y)
      .attr("r", 2.25)
      .attr("fill", COLORS.highlight);
  }
}

function renderRanking(derived) {
  dom.rankingChart.innerHTML = "";
  const rows = Array.from(
    d3.rollup(
      derived.typedPasses,
      (values) => ({
        count: values.length,
        avgGain: d3.mean(values, (pass) => pass.x_gain) ?? 0,
      }),
      (pass) => pass.player,
    ),
    ([player, value]) => ({
      player,
      count: value.count,
      avgGain: value.avgGain,
    }),
  ).sort((a, b) => d3.descending(a.count, b.count) || d3.descending(a.avgGain, b.avgGain));

  if (!rows.length) {
    drawEmptyState(dom.rankingChart, "No player comparison is available for the current filters.");
    return;
  }

  const topRows = includeSelectedPlayer(rows.slice(0, 8), rows);
  const width = 460;
  const height = 46 + topRows.length * 38;
  const margin = { top: 14, right: 56, bottom: 16, left: 168 };
  const svg = d3
    .select(dom.rankingChart)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("width", "100%")
    .style("height", "100%");

  const x = d3
    .scaleLinear()
    .domain([0, d3.max(topRows, (row) => row.count) || 1])
    .nice()
    .range([margin.left, width - margin.right]);

  const y = d3
    .scaleBand()
    .domain(topRows.map((row) => row.player))
    .range([margin.top, height - margin.bottom])
    .padding(0.28);

  svg
    .append("g")
    .selectAll("rect")
    .data(topRows)
    .join("rect")
    .attr("x", margin.left)
    .attr("y", (row) => y(row.player))
    .attr("height", y.bandwidth())
    .attr("rx", 8)
    .attr("width", (row) => x(row.count) - margin.left)
    .attr("fill", (row) =>
      row.player === state.player ? COLORS.highlight : withAlpha(derived.passType.accent, 0.55),
    )
    .style("cursor", "pointer")
    .on("click", (_, row) => {
      state.player = row.player === state.player ? "all" : row.player;
      state.selected_pass_id = null;
      state.active_story_id = null;
      dom.playerSelect.value = state.player;
      update();
    });

  svg
    .append("g")
    .selectAll("text.bar-label")
    .data(topRows)
    .join("text")
    .attr("class", "bar-label")
    .attr("x", margin.left - 12)
    .attr("y", (row) => y(row.player) + y.bandwidth() / 2 + 5)
    .attr("text-anchor", "end")
    .attr("font-size", 12.5)
    .attr("font-weight", (row) => (row.player === state.player ? 800 : 600))
    .text((row) => shortenName(row.player));

  svg
    .append("g")
    .selectAll("text.bar-value")
    .data(topRows)
    .join("text")
    .attr("class", "bar-value")
    .attr("x", (row) => x(row.count) + 8)
    .attr("y", (row) => y(row.player) + y.bandwidth() / 2 + 5)
    .attr("font-size", 12.5)
    .attr("font-weight", 700)
    .text((row) => row.count);
}

function includeSelectedPlayer(topRows, allRows) {
  if (state.player === "all" || topRows.some((row) => row.player === state.player)) {
    return topRows;
  }
  const selectedRow = allRows.find((row) => row.player === state.player);
  if (!selectedRow) {
    return topRows;
  }
  return [...topRows.slice(0, Math.max(0, topRows.length - 1)), selectedRow];
}

function renderTimeline(derived) {
  dom.timelineChart.innerHTML = "";
  const width = 960;
  const height = 250;
  const margin = { top: 12, right: 16, bottom: 34, left: 34 };

  const svg = d3
    .select(dom.timelineChart)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("width", "100%")
    .style("height", "100%");

  const bins = d3.range(0, app.maxMinute + 1).map((minute) => ({
    minute,
    count: 0,
  }));

  derived.focusedPasses.forEach((pass) => {
    const minute = Math.max(0, Math.min(app.maxMinute, Math.floor(pass.clock_minute)));
    bins[minute].count += 1;
  });

  const x = d3
    .scaleLinear()
    .domain([0, app.maxMinute + 1])
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(bins, (bin) => bin.count) || 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  svg
    .append("g")
    .selectAll("rect")
    .data(bins)
    .join("rect")
    .attr("x", (bin) => x(bin.minute) + 0.75)
    .attr("y", (bin) => y(bin.count))
    .attr("width", Math.max(2, x(1) - x(0) - 1.5))
    .attr("height", (bin) => y(0) - y(bin.count))
    .attr("rx", 2)
    .attr("fill", withAlpha(derived.passType.accent, 0.72));

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickValues(d3.range(0, app.maxMinute + 1, 15)).tickFormat((d) => `${d}'`))
    .call((axis) => axis.select(".domain").attr("stroke", "rgba(19, 19, 19, 0.12)"))
    .call((axis) => axis.selectAll("text").attr("fill", COLORS.textSoft).attr("font-size", 12));

  const brush = d3
    .brushX()
    .extent([
      [margin.left, margin.top],
      [width - margin.right, height - margin.bottom],
    ])
    .on("end", ({ selection, sourceEvent }) => {
      if (!sourceEvent) {
        return;
      }
      if (!selection) {
        state.minute_range = [0, app.maxMinute];
        update();
        return;
      }
      const [start, end] = selection.map(x.invert);
      const nextRange = [Math.max(0, Math.floor(start)), Math.min(app.maxMinute, Math.ceil(end))];
      if (
        nextRange[0] !== state.minute_range[0] ||
        nextRange[1] !== state.minute_range[1]
      ) {
        state.minute_range = nextRange;
        state.selected_pass_id = null;
        state.active_story_id = null;
        update();
      }
    });

  const brushGroup = svg.append("g").call(brush);
  if (state.minute_range[0] !== 0 || state.minute_range[1] !== app.maxMinute) {
    brushGroup.call(brush.move, [x(state.minute_range[0]), x(state.minute_range[1])]);
  }

  if (!derived.focusedPasses.length) {
    svg
      .append("text")
      .attr("class", "empty-state")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("font-size", 14)
      .text("No matching passes to brush.");
  }
}

function renderSequence(derived) {
  dom.sequenceChart.innerHTML = "";

  if (!derived.selectedPass) {
    dom.sequenceIntro.textContent =
      "Click any line on the pass map to replay the full passing move.";
    dom.sequenceMeta.innerHTML = "";
    drawEmptyState(dom.sequenceChart, "No passing move is currently selected.");
    return;
  }

  const selected = derived.selectedPass;
  const sequence = [...(app.sequences.get(selected.sequence_key) ?? [])].sort((a, b) =>
    d3.ascending(a.sequence_index, b.sequence_index),
  );
  const match = app.matchesById.get(selected.match_id);
  const tags = [
    `${selected.minute}'`,
    match.label,
    `${sequence.length} passes in the move`,
  ];

  if (selected.progressive) tags.push("forward pass");
  if (selected.box_entry) tags.push("into the penalty area");
  if (selected.switch) tags.push("cross-field pass");
  if (selected.shot_assist) tags.push("pass before a shot");

  dom.sequenceIntro.textContent = `${selected.player} to ${selected.recipient}`;
  dom.sequenceMeta.innerHTML = `<p>${tags.join(" · ")}</p>`;

  const svg = createPitchSvg(dom.sequenceChart, { minHeight: 260, inset: true });
  appendArrowDefs(svg, derived.passType.accent, "sequence");

  const shadowLayer = svg.append("g");
  shadowLayer
    .selectAll("path")
    .data(sequence, (pass) => pass.id)
    .join("path")
    .attr("d", (pass) => linePath(pass))
    .attr("fill", "none")
    .attr("stroke", COLORS.neutral)
    .attr("stroke-width", 0.9)
    .attr("stroke-linecap", "round")
    .attr("marker-end", "url(#sequence-marker-neutral)");

  const step = Math.max(70, Math.min(190, 2200 / Math.max(sequence.length, 1)));
  const animationLayer = svg.append("g");

  const animated = animationLayer
    .selectAll("path")
    .data(sequence, (pass) => pass.id)
    .join("path")
    .attr("d", (pass) => linePath(pass))
    .attr("fill", "none")
    .attr("stroke", (pass) => (pass.id === selected.id ? COLORS.highlight : derived.passType.accent))
    .attr("stroke-width", (pass) => (pass.id === selected.id ? 2.15 : 1.35))
    .attr("stroke-linecap", "round")
    .attr("marker-end", (pass) =>
      pass.id === selected.id ? "url(#sequence-marker-selected)" : "url(#sequence-marker-accent)",
    )
    .attr("stroke-dasharray", function () {
      const length = this.getTotalLength();
      return `${length} ${length}`;
    })
    .attr("stroke-dashoffset", function () {
      return this.getTotalLength();
    })
    .attr("opacity", 0);

  animated
    .transition()
    .delay((_, index) => index * step)
    .duration(step + 120)
    .attr("opacity", 1)
    .attr("stroke-dashoffset", 0);
}

function createPitchSvg(container, options = {}) {
  container.innerHTML = "";
  const svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", "-6 -6 132 92")
    .style("width", "100%")
    .style("height", "100%");

  svg.append("rect").attr("x", -6).attr("y", -6).attr("width", 132).attr("height", 92).attr("fill", "transparent");

  drawPitchBase(svg);

  if (options.title) {
    svg
      .append("text")
      .attr("class", "empty-state")
      .attr("x", 60)
      .attr("y", 40)
      .attr("text-anchor", "middle")
      .attr("font-size", 4.6)
      .attr("fill", "rgba(248, 247, 242, 0.78)")
      .text(options.title);
  }

  return svg;
}

function drawPitchBase(svg) {
  svg
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", 120)
    .attr("height", 80)
    .attr("rx", 2)
    .attr("fill", COLORS.fieldFill);

  d3.range(0, 6).forEach((stripe) => {
    svg
      .append("rect")
      .attr("x", stripe * 20)
      .attr("y", 0)
      .attr("width", 10)
      .attr("height", 80)
      .attr("fill", COLORS.fieldStripe);
  });

  const lines = svg.append("g").attr("stroke", COLORS.fieldLine).attr("fill", "none");
  lines.append("rect").attr("x", 0).attr("y", 0).attr("width", 120).attr("height", 80);
  lines.append("line").attr("x1", 60).attr("y1", 0).attr("x2", 60).attr("y2", 80);
  lines.append("circle").attr("cx", 60).attr("cy", 40).attr("r", 10);
  lines.append("circle").attr("cx", 60).attr("cy", 40).attr("r", 0.7).attr("fill", COLORS.fieldLine);
  lines.append("rect").attr("x", 0).attr("y", 18).attr("width", 18).attr("height", 44);
  lines.append("rect").attr("x", 102).attr("y", 18).attr("width", 18).attr("height", 44);
  lines.append("rect").attr("x", 0).attr("y", 30).attr("width", 6).attr("height", 20);
  lines.append("rect").attr("x", 114).attr("y", 30).attr("width", 6).attr("height", 20);
  lines.append("circle").attr("cx", 12).attr("cy", 40).attr("r", 0.7).attr("fill", COLORS.fieldLine);
  lines.append("circle").attr("cx", 108).attr("cy", 40).attr("r", 0.7).attr("fill", COLORS.fieldLine);

  svg
    .append("text")
    .attr("x", 6)
    .attr("y", 74.5)
    .attr("font-size", 4.1)
    .attr("font-weight", 700)
    .attr("fill", "rgba(248, 247, 242, 0.68)")
    .text("Leverkusen attack direction");

  svg
    .append("line")
    .attr("x1", 46)
    .attr("y1", 73.4)
    .attr("x2", 68)
    .attr("y2", 73.4)
    .attr("stroke", "rgba(248, 247, 242, 0.68)")
    .attr("stroke-width", 0.8)
    .attr("marker-end", "url(#attack-direction)");

  svg
    .append("defs")
    .append("marker")
    .attr("id", "attack-direction")
    .attr("viewBox", "0 0 10 10")
    .attr("refX", 8.5)
    .attr("refY", 5)
    .attr("markerWidth", 3.2)
    .attr("markerHeight", 3.2)
    .attr("orient", "auto-start-reverse")
    .append("path")
    .attr("d", "M 0 0 L 10 5 L 0 10 z")
    .attr("fill", "rgba(248, 247, 242, 0.68)");
}

function appendArrowDefs(svg, accentColor, prefix = "pitch") {
  const defs = svg.append("defs");
  const markers = [
    { id: `${prefix}-marker-accent`, color: accentColor },
    { id: `${prefix}-marker-neutral`, color: COLORS.neutral },
    { id: `${prefix}-marker-miss`, color: COLORS.miss },
    { id: `${prefix}-marker-selected`, color: COLORS.highlight },
  ];

  markers.forEach((marker) => {
    defs
      .append("marker")
      .attr("id", marker.id)
      .attr("viewBox", "0 0 10 10")
      .attr("refX", 8.4)
      .attr("refY", 5)
      .attr("markerWidth", 3.1)
      .attr("markerHeight", 3.1)
      .attr("orient", "auto-start-reverse")
      .append("path")
      .attr("d", "M 0 0 L 10 5 L 0 10 z")
      .attr("fill", marker.color);
  });
}

function linePath(pass) {
  return `M ${pass.start_x} ${pass.start_y} L ${pass.end_x} ${pass.end_y}`;
}

function passStroke(pass, accent, highlightedPassId) {
  if (pass.id === highlightedPassId) {
    return COLORS.highlight;
  }
  if (!pass.successful && state.outcome === "all") {
    return COLORS.miss;
  }
  return accent;
}

function passOpacity(pass, highlightedPassId) {
  if (pass.id === highlightedPassId) {
    return 1;
  }
  return !pass.successful && state.outcome === "all" ? 0.36 : 0.46;
}

function markerForPass(pass, highlightedPassId) {
  if (pass.id === highlightedPassId) {
    return "url(#pitch-marker-selected)";
  }
  if (!pass.successful && state.outcome === "all") {
    return "url(#pitch-marker-miss)";
  }
  return "url(#pitch-marker-accent)";
}

function resultColor(result) {
  if (result === "W") {
    return COLORS.accent;
  }
  if (result === "D") {
    return COLORS.secondary;
  }
  return COLORS.miss;
}

function showMatchTooltip(event, match) {
  const resultWord = match.result === "W" ? "Win" : "Draw";
  const note = [resultWord, `${match.scoreline} score`, `${match.cumulative_points} points so far`];
  const goalLine = match.goals.length
    ? match.goals
        .map((goal) => `${goal.minute}' ${goal.is_leverkusen ? "LEV" : "OPP"}`)
        .join(" · ")
    : "No goals";
  if (match.title_clinch) {
    note.push("title clinched");
  } else if (match.clean_sheet) {
    note.push("clean sheet");
  }

  dom.tooltip.innerHTML = `
    <p><strong>MD ${match.matchday}</strong> · ${match.label}</p>
    <p>${note.join(" · ")}</p>
    <p>${goalLine}</p>
  `;
  dom.tooltip.classList.remove("hidden");
  moveTooltip(event);
}

function showTooltip(event, pass) {
  const match = app.matchesById.get(pass.match_id);
  const badges = [];
  if (pass.progressive) badges.push("forward pass");
  if (pass.final_third_entry) badges.push("into attacking third");
  if (pass.box_entry) badges.push("into penalty area");
  if (pass.switch) badges.push("cross-field pass");
  if (pass.shot_assist) badges.push("pass before a shot");

  dom.tooltip.innerHTML = `
    <p><strong>${pass.player}</strong> → ${pass.recipient}</p>
    <p>${match.label} · ${pass.minute}' · forward movement ${FORMAT_ONE_DECIMAL(pass.x_gain)}</p>
    <p>${pass.play_pattern}${badges.length ? ` · ${badges.join(" · ")}` : ""}</p>
  `;
  dom.tooltip.classList.remove("hidden");
  moveTooltip(event);
}

function moveTooltip(event) {
  dom.tooltip.style.left = `${event.clientX + 16}px`;
  dom.tooltip.style.top = `${event.clientY + 16}px`;
}

function hideTooltip() {
  dom.tooltip.classList.add("hidden");
}

function buildPlayerSpotlights(passes) {
  return PLAYER_SPOTLIGHT_CONFIGS.map((config) => {
    const statValue = passes.filter(
      (pass) =>
        pass.player === config.player &&
        pass.open_play &&
        pass.successful &&
        Boolean(pass[config.metricKey]),
    ).length;

    return {
      ...config,
      statValue,
      filters: {
        match_id: "all",
        player: config.player,
        pass_type: config.passType,
        phase: "open",
        outcome: "complete",
        minute_range: [0, Math.ceil(d3.max(passes, (pass) => pass.clock_minute))],
      },
    };
  });
}

function teamGoals(match) {
  return match.home_team === app.summary.team ? match.home_score : match.away_score;
}

function opponentGoals(match) {
  return match.home_team === app.summary.team ? match.away_score : match.home_score;
}

function drawEmptyState(container, message) {
  const svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", "0 0 420 220")
    .style("width", "100%")
    .style("height", "100%");

  svg
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", 420)
    .attr("height", 220)
    .attr("rx", 18)
    .attr("fill", "rgba(255, 255, 255, 0.04)");

  svg
    .append("text")
    .attr("class", "empty-state")
    .attr("x", 210)
    .attr("y", 112)
    .attr("text-anchor", "middle")
    .attr("font-size", 14)
    .text(message);
}

function withAlpha(color, alpha) {
  const parsed = d3.color(color);
  if (!parsed) {
    return color;
  }
  parsed.opacity = alpha;
  return parsed.formatRgb();
}

function shortenName(name) {
  const pieces = name.split(" ");
  if (pieces.length <= 2) {
    return name;
  }
  return `${pieces[0]} ${pieces[pieces.length - 1]}`;
}
