const DEFAULT_HISTORY_LIMIT = 50;

function pad2(v){
	return v < 10 ? `0${v}` : `${v}`;
}

function formatTimestamp(date){
	return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export function initStatusBar(element, opts = {}){
	if (!element) return null;

	const limit = Math.max(
		1,
		Number.isFinite(opts.historyLimit)
			? opts.historyLimit
			: (Number.isFinite(opts.limit) ? opts.limit : DEFAULT_HISTORY_LIMIT),
	);
	const history = [];
	let latest = element.textContent || "";
	const messageEl = document.createElement("span");
	messageEl.className = "status__text";
	messageEl.textContent = latest && latest.trim() ? latest : "\u00a0";
	while (element.firstChild) element.removeChild(element.firstChild);
	element.appendChild(messageEl);
	let panel = null;
	let isOpen = false;
	let outsideHandler = null;
	let escHandler = null;
	const panelId = element.id
		? `${element.id}-history`
		: `status-history-${Math.random().toString(36).slice(2)}`;

	function ensureLiveRegion(){
		if (!element.hasAttribute("aria-live")) element.setAttribute("aria-live", "polite");
		if (!element.hasAttribute("role")) element.setAttribute("role", "button");
		if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "0");
		element.setAttribute("aria-expanded", isOpen ? "true" : "false");
		if (!element.getAttribute("title")) element.setAttribute("title", "Status (click to view history)");
	}

	function pushHistory(entry){
		history.push(entry);
		if (history.length > limit) history.splice(0, history.length - limit);
	}

	function renderHistory(){
		if (!panel) return;
		panel.innerHTML = "";
		panel.setAttribute("role", "log");
		panel.setAttribute("aria-label", "Status message history");

		const heading = document.createElement("div");
		heading.className = "status-history__header";
		heading.textContent = "Status history";
		panel.appendChild(heading);

		if (!history.length){
			const empty = document.createElement("div");
			empty.className = "status-history__empty";
			empty.textContent = "No messages yet.";
			panel.appendChild(empty);
			return;
		}

		const list = document.createElement("ul");
		list.className = "status-history__list";
		panel.appendChild(list);

		for (const entry of [...history].reverse()){
			const item = document.createElement("li");
			item.className = "status-history__item";

			const time = document.createElement("time");
			time.className = "status-history__item-time";
			time.dateTime = entry.time.toISOString();
			time.textContent = formatTimestamp(entry.time);
			item.appendChild(time);

			const text = document.createElement("div");
			text.className = "status-history__item-text";
			text.textContent = entry.message;
			item.appendChild(text);

			list.appendChild(item);
		}
	}

	function ensurePanel(){
		if (panel) return;
		panel = document.createElement("div");
		panel.className = "status-history";
		panel.id = panelId;
		panel.dataset.open = "false";
		element.setAttribute("aria-controls", panelId);
		element.appendChild(panel);
		renderHistory();
	}

	function onDocumentMouseDown(e){
		if (!panel) return;
		if (element.contains(e.target)) return;
		hideHistory();
	}

	function onDocumentKeyDown(e){
		if (e.key === "Escape"){
			e.preventDefault();
			e.stopPropagation();
			hideHistory();
			element.focus();
		}
	}

	function showHistory(){
		ensurePanel();
		renderHistory();
		panel.dataset.open = "true";
		panel.style.display = "flex";
		isOpen = true;
		element.setAttribute("aria-expanded", "true");
		if (!outsideHandler){
			outsideHandler = onDocumentMouseDown;
			document.addEventListener("mousedown", outsideHandler, true);
		}
		if (!escHandler){
			escHandler = onDocumentKeyDown;
			document.addEventListener("keydown", escHandler, true);
		}
	}

	function hideHistory(){
		if (!panel) return;
		panel.dataset.open = "false";
		panel.style.display = "none";
		isOpen = false;
		element.setAttribute("aria-expanded", "false");
		if (outsideHandler){
			document.removeEventListener("mousedown", outsideHandler, true);
			outsideHandler = null;
		}
		if (escHandler){
			document.removeEventListener("keydown", escHandler, true);
			escHandler = null;
		}
	}

	function toggleHistory(){
		if (isOpen) hideHistory();
		else showHistory();
	}

	function set(message, opts = {}){
		const msg = message == null ? "" : String(message);
		latest = msg;
		if (messageEl && messageEl.parentNode !== element && element) element.insertBefore(messageEl, element.firstChild);
		if (messageEl && messageEl.parentNode === element) messageEl.textContent = msg || "\u00a0";
		else if (messageEl) messageEl.textContent = msg || "\u00a0";
		else if (element) element.textContent = msg || "\u00a0";
		const skipHistory = opts.skipHistory ?? (msg.trim() === "");
		if (!skipHistory){
			pushHistory({ message: msg, time: opts.time instanceof Date ? opts.time : new Date() });
			renderHistory();
		}else{
			renderHistory();
		}
		return latest;
	}

	function clear(){
		set("", { skipHistory: true });
	}

	function getHistory(){
		return history.map(entry => ({ ...entry }));
	}

	function handleClick(){
		toggleHistory();
	}

	function handleKeyDown(e){
		if (e.key === "Enter" || e.key === " " ){
			e.preventDefault();
			toggleHistory();
		}
	}

	element.dataset.interactive = "true";
	element.addEventListener("click", handleClick);
	element.addEventListener("keydown", handleKeyDown);

	ensureLiveRegion();
	if (latest && latest.trim()){
		pushHistory({ message: latest, time: new Date() });
		renderHistory();
	}

	return {
		element,
		set,
		clear,
		getHistory,
		showHistory,
		hideHistory,
		toggleHistory,
		ensureLiveRegion,
		get text(){ return latest; },
		set text(v){ set(v); },
	};
}
