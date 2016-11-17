/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2014 Omega Cube and contributors
 * Xavier Roger-Machart, xrm@omegacube.fr
 * Nicolas Lantoing, nicolas@omegacube.fr
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
define(['jquery', 'libs/d3', 'dashboards.manager', 'onoc.calendar'], function (jQuery, d3, DashboardManager, Calendar){
    /**
     * Called on init, build the svg container and settup events listeners
     */
    function _buildContainer(){
        var headerHeight = 30;
        var svgHeight = this.containers.main.height() - headerHeight;
        var defaultRange = 1000 * 24 * 3600;

        //timeline header
        var commands = $("<div></div>");
        commands.attr('class','dashboard-timeline-header');
        this.containers.main.append(commands);

        var timepicker = $('<span class="datepicker"></span>');
        var from = $('<input class="datePicker" type="text" value="'+(this.start.toLocaleDateString())+'" name="from" readonly="readonly" />');
        var until = $('<input class="datePicker" type="text" value="'+(this.end.toLocaleDateString())+'" name="until" readonly="readonly" />');

        var fromCalendar = new Calendar(from, function(time){
            var fromTime = new Date(time);
            var untilTime = this.end;
            if(fromTime > untilTime) untilTime = new Date(fromTime.getTime() + defaultRange);

            this.setStart(fromTime);
            this.setEnd(untilTime);
            this.scale.domain([this.start,this.end]);
            this.brush.x(this.scale);
            this.redraw();
            this.containers.main.trigger("timeline.update", [fromTime,untilTime]);
        }.bind(this));
        var untilCalendar = new Calendar(until,function(time){
            var fromTime = this.start;
            var untilTime = new Date(time);
            untilTime.setHours(23);
            untilTime.setMinutes(59);
            untilTime.setSeconds(59);
            if(fromTime > untilTime) fromTime = new Date(untilTime.getTime() - defaultRange);

            this.setStart(fromTime);
            this.setEnd(untilTime);
            this.scale.domain([this.start,this.end]);
            this.brush.x(this.scale);
            this.redraw();
            this.containers.main.trigger("timeline.update",[fromTime,untilTime]);
        }.bind(this));

        commands.append('<h3>Global Timeline</h3>').append(timepicker).append('<span>From :</span>').append(from).append('<span>To :</span>').append(until);

        //svg
        var svg = d3.select(this.containers.main[0]).append("svg")
            .attr("width",this.containers.main.width())
            .attr("height", svgHeight)
            .attr("font-size", "12");

        var scale = d3.time.scale()
            .range([20,this.containers.main.width() - 20])
            .domain([this.start,this.end]);

        var axis = d3.svg.axis().scale(scale)
            .orient('bottom')
            .innerTickSize('-' + (svgHeight - 30))
            .outerTickSize(0)
            .tickPadding(8);

        var brush = d3.svg.brush().x(scale);
        brush.on("brushend", function(){
            if(!this.brush.empty())
                this.containers.main.trigger("timeline.update",this.brush.extent());
            return true;
        }.bind(this));
        brush.on("brush",function(){
            var newbrush = d3.event.target.extent();
            from.attr('value',newbrush[0].toLocaleString());
            until.attr('value',newbrush[1].toLocaleString());
        });
        var scaleContainer = svg.append('g')
            .attr('class','scale')
            .attr('transform','translate(0,'+(svgHeight - 25)+')')
            .attr('style','stroke:#fff;fill:#fff;');
        scaleContainer.call(axis);
        var brushContainer = svg.append('g');
        brushContainer.attr('class','brush').call(brush)
            .selectAll('rect').attr('height', svgHeight)
            .attr('fill-opacity','0.2').attr('fill','#FFF').attr('stroke','#fff');

        this.brush = brush;
        this.scale = scale;
        this.axis = axis;

        this.calendars.from = fromCalendar;
        this.calendars.until = untilCalendar;
        
        this.containers.svg = svg;
        this.containers.brush = brushContainer;
        this.containers.scale = scaleContainer;
        this.containers.from = from;
        this.containers.until = until;
    };

    /**
     * Manage a timeline, actually only used by the global timeline widget but can be used as a standalone
     * @param {JQueryElement} container - The main container
     * @prop {Date} start               - Full timeline start time
     * @prop {Date} end                 - Full timeline end time
     * @prop {d3Brush} brush            - Timeline's brush
     * @prop {d3Axis} axis              - Axis for timeline rendering
     * @prop {d3Scale} scale            - Scale used by axis and brush
     * @prop {Object} containers        - JQuery selectors collection.
     * @prop {Object} calendars         - Store from and until Calendars instances.
     */
    var DashboardTimeline = function(container){
        this.start = new Date();
        this.end = new Date();
        this.brush = false;
        this.scale = false;
        this.axis = false;

        this.containers = {
            'main': container,
            'brush': false,
            'scale': false,
            'from': false,
            'until': false
        };

        this.calendars = {
            'from': false,
            'until': false
        };
        
        _buildContainer.call(this);
    };

    /**
     * Return the current brush domain
     */
    DashboardTimeline.prototype.get = function(){
        return this.brush.domain();
    };

    /**
     * Update timeline and redraw if necessary
     * @param {Date} start
     * @param {Date} end
     */
    DashboardTimeline.prototype.update = function(start,end){
        if(start && start instanceof Date) var start = start.getTime();
        if(end && end instanceof Date) var end = end.getTime();

        var check = false;
        if(start && start < this.start.getTime()){
            this.start = new Date(start);
            this.calendars.from.set(this.start);
            this.containers.from.attr('value',this.start.toLocaleDateString());
            check = true;
        }
        if(end > this.end.getTime()){
            this.end = new Date(end);
            this.calendars.until.set(this.end);
            this.containers.until.attr('value',this.end.toLocaleDateString());
            check = true;
        }

        if(check){
            this.scale.domain([this.start,this.end]);
            this.brush.x(this.scale);
            this.redraw();
        }
    };

    /**
     * Redraw the timeline
     */
    DashboardTimeline.prototype.redraw = function(){
        this.brush.clear();
        this.brush(this.containers.brush);
        this.containers.scale.call(this.axis);
    };

    /**
     * Display on
     */
    DashboardTimeline.prototype.show = function(){
        this.containers.main.attr('style','display: block;');
    };

    /**
     * Display off
     */
    DashboardTimeline.prototype.hide = function(){
        this.containers.main.attr('style','display: hidden;');
    };

    /**
     * Set this.start
     */
    DashboardTimeline.prototype.setStart = function(start){
        if(typeof start === 'Number')
            this.start = new Date(start);
        else if(start instanceof Date)
            this.start = start;
        else
            return false;
        return true;
    };

    /**
     * Set this.end
     */
    DashboardTimeline.prototype.setEnd = function(end){
        if(typeof end === 'Number')
            this.end = new Date(end);
        else if(end instanceof Date)
            this.end = end;
        else
            return false;
        return true;
    };

    return DashboardTimeline;
});
