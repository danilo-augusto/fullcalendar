
/*
Caller must:
- call initSegChronoComponent
- implement componentFootprintToSegs
- implement renderFgSegs
- implement unrenderFgSegs

This mixin can depend on ChronoComponent:
- opt
- _getView
- eventRangesToEventFootprints
- eventFootprintsToSegs
*/
var SegChronoComponentMixin = {

	segs: null, // the *event* segments currently rendered in the grid. TODO: rename to `eventSegs`
	eventRenderUtils: null,
	fillSystem: null,


	initSegChronoComponent: function() {
		this.eventRenderUtils = new this.eventRenderUtilsClass(this);
		this.fillSystem = new this.fillSystemClass(this);
	},


	renderEventsPayload: function(eventsPayload) {
		var view = this._getView();
		var id, eventInstanceGroup;
		var eventRenderRanges;
		var eventFootprints;
		var eventSegs;
		var bgSegs = [];
		var fgSegs = [];

		for (id in eventsPayload) {
			eventInstanceGroup = eventsPayload[id];

			eventRenderRanges = eventInstanceGroup.sliceRenderRanges(view.activeUnzonedRange);
			eventFootprints = this.eventRangesToEventFootprints(eventRenderRanges);
			eventSegs = this.eventFootprintsToSegs(eventFootprints);

			if (eventInstanceGroup.getEventDef().hasBgRendering()) {
				bgSegs.push.apply(bgSegs, // append
					eventSegs
				);
			}
			else {
				fgSegs.push.apply(fgSegs, // append
					eventSegs
				);
			}
		}

		this.segs = [].concat( // record all segs
			this.renderBgSegs(bgSegs) || bgSegs,
			this.renderFgSegs(fgSegs) || fgSegs
		);
	},


	// Unrenders all events currently rendered on the grid
	unrenderEvents: function() {
		this.handleSegMouseout(); // trigger an eventMouseout if user's mouse is over an event

		this.unrenderFgSegs();
		this.unrenderBgSegs();

		this.segs = null;
	},


	// Retrieves all rendered segment objects currently rendered on the grid
	getEventSegs: function() {
		return this.segs || [];
	},


	// Foreground Segment Rendering
	// ---------------------------------------------------------------------------------------------------------------


	// Renders foreground event segments onto the grid. May return a subset of segs that were rendered.
	renderFgSegs: function(segs) {
		// subclasses must implement
	},


	// Unrenders all currently rendered foreground segments
	unrenderFgSegs: function() {
		// subclasses must implement
	},


	/* Background Segment Rendering
	------------------------------------------------------------------------------------------------------------------*/


	// Renders the given background event segments onto the grid.
	// Returns a subset of the segs that were actually rendered.
	renderBgSegs: function(segs) {
		return this.fillSystem.render('bgEvent', segs);
	},


	// Unrenders all the currently rendered background event segments
	unrenderBgSegs: function() {
		this.fillSystem.unrender('bgEvent');
	},


	/* Business Hours
	------------------------------------------------------------------------------------------------------------------*/


	// Compute business hour segs for the grid's current date range.
	// Caller must ask if whole-day business hours are needed.
	buildBusinessHourSegs: function(wholeDay) {
		return this.eventFootprintsToSegs(
			this.buildBusinessHourEventFootprints(wholeDay)
		);
	},


	// Compute business hour *events* for the grid's current date range.
	// Caller must ask if whole-day business hours are needed.
	// FOR RENDERING
	buildBusinessHourEventFootprints: function(wholeDay) {
		var calendar = this.view.calendar;

		return this._buildBusinessHourEventFootprints(wholeDay, calendar.opt('businessHours'));
	},


	_buildBusinessHourEventFootprints: function(wholeDay, businessHourDef) {
		var view = this.view;
		var calendar = view.calendar;
		var eventInstanceGroup;
		var eventRanges;

		eventInstanceGroup = calendar.buildBusinessInstanceGroup(
			wholeDay,
			businessHourDef,
			view.renderUnzonedRange
		);

		if (eventInstanceGroup) {
			eventRanges = eventInstanceGroup.sliceRenderRanges(
				view.renderUnzonedRange,
				calendar
			);
		}
		else {
			eventRanges = [];
		}

		return this.eventRangesToEventFootprints(eventRanges);
	},


	/* Implement Highlight
	------------------------------------------------------------------------------------------------------------------*/


	// Renders an emphasis on the given date range. Given a span (unzoned start/end and other misc data)
	renderHighlight: function(componentFootprint) {
		this.fillSystem.render('highlight', this.componentFootprintToSegs(componentFootprint));
	},


	// Unrenders the emphasis on a date range
	unrenderHighlight: function() {
		this.fillSystem.unrender('highlight');
	},


	/* Fill System
	------------------------------------------------------------------------------------------------------------------*/


	fillSystemClass: FillSystem.extend({

		eventRenderUtils: null,


		constructor: function(component) {
			FillSystem.call(this);
			this.eventRenderUtils = component.eventRenderUtils;
		},


		attachSegEls: function(segs) {
			// subclasses must implement
		},


		// Renders a background event element, given the default rendering. Called by the fill system.
		bgEventSegEl: function(seg, el) {
			return this.eventRenderUtils.filterEventRenderEl(seg.footprint, el);
		},


		// Generates an array of classNames to be used for the default rendering of a background event.
		bgEventSegClasses: function(seg) {
			return this.eventRenderUtils.getBgClasses(seg.footprint);
		},


		// Generates a semicolon-separated CSS string to be used for the default rendering of a background event.
		bgEventSegCss: function(seg) {
			return {
				'background-color': this.eventRenderUtils.getSkinCss(seg.footprint)['background-color']
			};
		},


		// Generates an array of classNames to be used for the rendering business hours overlay.
		businessHoursSegClasses: function(seg) {
			return [ 'fc-nonbusiness', 'fc-bgevent' ];
		},


		// Generates an array of classNames for rendering the highlight.
		// USED BY THE FILL SYSTEM, FillSystem::buildSegHtml
		highlightSegClasses: function() {
			return [ 'fc-highlight' ];
		}

	}),


	/* Event Rendering Utils
	------------------------------------------------------------------------------------------------------------------*/


	eventRenderUtilsClass: EventRenderUtils,


	sortEventSegs: function(segs) {
		segs.sort(proxy(this, 'compareEventSegs'));
	},


	// A cmp function for determining which segments should take visual priority
	compareEventSegs: function(seg1, seg2) {
		var view = this._getView(); // TODO: not optimal!
		var f1 = seg1.footprint.componentFootprint;
		var r1 = f1.unzonedRange;
		var f2 = seg2.footprint.componentFootprint;
		var r2 = f2.unzonedRange;

		return r1.startMs - r2.startMs || // earlier events go first
			(r2.endMs - r2.startMs) - (r1.endMs - r1.startMs) || // tie? longer events go first
			f2.isAllDay - f1.isAllDay || // tie? put all-day events first (booleans cast to 0/1)
			compareByFieldSpecs(
				seg1.footprint.eventDef,
				seg2.footprint.eventDef,
				view.eventOrderSpecs
			);
	},


	/* Converting componentFootprint/eventFootprint -> segs
	------------------------------------------------------------------------------------------------------------------*/


	eventFootprintsToSegs: function(eventFootprints) {
		var segs = [];
		var i;

		for (i = 0; i < eventFootprints.length; i++) {
			segs.push.apply(segs,
				this.eventFootprintToSegs(eventFootprints[i])
			);
		}

		return segs;
	},


	// Given an event's span (unzoned start/end and other misc data), and the event itself,
	// slices into segments and attaches event-derived properties to them.
	// eventSpan - { start, end, isStart, isEnd, otherthings... }
	// constraintRange allow additional clipping. optional. eventually remove this.
	eventFootprintToSegs: function(eventFootprint, constraintRange) {
		var unzonedRange = eventFootprint.componentFootprint.unzonedRange;
		var segs;
		var i, seg;

		if (constraintRange) {
			unzonedRange = unzonedRange.intersect(constraintRange);
		}

		segs = this.componentFootprintToSegs(eventFootprint.componentFootprint);

		for (i = 0; i < segs.length; i++) {
			seg = segs[i];

			if (!unzonedRange.isStart) {
				seg.isStart = false;
			}
			if (!unzonedRange.isEnd) {
				seg.isEnd = false;
			}

			seg.footprint = eventFootprint;
			// TODO: rename to seg.eventFootprint
		}

		return segs;
	},


	componentFootprintToSegs: function(componentFootprint) {
		// subclasses must implement
	}

};
