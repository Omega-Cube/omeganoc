/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2016 Omega Cube and contributors
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
'use strict';

define([
    'jquery',
    'libs/d3',
    'dashboards.manager',
    'dashboards.widget',
    'dashboards.probes', 
    'onoc.createurl',
    'charts/forms',
    'charts/scales',
    'onoc.units',
    'charts/legend',
    'charts/predict',
    'onoc.calendar',
    'onoc.tooltips',
    'onoc.config'
], function(
    jQuery, 
    d3,
    DashboardManager, 
    Widget, 
    DashboardProbes, 
    createUrl, 
    form, 
    DashboardChartScale, 
    Units, 
    Legends, 
    Predict, 
    Calendar, 
    Tooltips,
    Config) 
{
    /**
     * Basicchart widget class,handle multiple charts
     * @class
     * @property {Number} id                - The widget id
     * @property {Object} scales            - Store Scale instances
     * @property {Predict} predict          - Predict instance
     * @property {Object} predictData       - Cache predicted data
     * @property {Units} units              - Units instance
     * @property {Object} legends           - Store legends containers
     * @property {Legends} legendManager    - Legends instance
     * @property {Object} content           - Store redraw method for each probe
     * @property {Boolean} opposate         - Setted to true if there is probe in reverse mode (bottom)
     * @property {Date} cursorPos           - Current cursor position date
     * @property {Object} logs              - Store logs
     * @property {Object} probes            - Store probes local config (aka color and order)
     * @property {Number} counter           - Current probes length
     * @property {Object} _stackedLogsCache - Cache and store logs stacks
     * @property {Object} data              - Full timeline aggregated data
     * @property {Object} currentData       - Currently focused aggregated data
     * @property {Boolean} needAutoScale    - if true will autoscale on the next aggregate event
     * @property {Object} axis              - Contain x axis d3 scales and axis object.
     * @property {Object} conf
     *                    conf.width:           {Number} available width
     *                    conf.containerHeight: {Number} full part height
     *                    conf.containerWidth:  {Number} full part width
     *                    conf.trackHeight:     {Number} Context part height
     *                    conf.chartHeight:     {Number} Focus part height
     *                    conf.chartMargin:     {Array} focus part margins
     *                    conf.trackMargin:     {Array} context part margins
     *                    conf.log:             {Boolean} logarithmic mode
     *                    conf.fromDate:        {Date} Full timeline start date
     *                    conf.untilDate:       {Date} Full timeline end date
     *                    conf.mode:            {String} aggregation mode
     *                    conf.brushstart:      {Date} Saved brush state start time
     *                    conf.brushend:        {Date} Saved brush state end time
     *                    conf.saving:          {Boolean} Used to define if we need to save the current brush state on zoom events.
     * @property {Object} container         - Store containers elements
     * @property {Object} current           - Current active scales on y axis.
     */
    var DashboardChart = function() {
        this.id = false;
        this.scales = {};
        this.predict = new Predict();
        this.predictData = {};
        this.units = Units;
        this.legends = {};
        this.legendManager = false;
        this.content = {};
        this.opposate = false;
        this.cursorPos = false;
        this.logs = false;
        this.probes = false;
        this._stackedLogsCache = {};
        this.data = false;
        this.currentData = false;
        this.needAutoScale = false;

        this.axis = {
            xAxis: false,
            xAxis2: false,
            x: false,
            x2: false
        };
        this.conf= {
            width: false,
            containerHeight: false,
            containerWidth: false,
            trackHeight: false,
            chartHeight: false,
            chartMargin: { top: 30, right: 90, bottom: 30, left: 90 },
            trackMargin: { top: 40, right: 90, bottom: 10, left: 90 },
            log: false,
            fromDate: false,
            untilDate: false,
            mode: 'max',
            brushstart: false,
            brushend: false,
            saving: false
        };
        this.container= {
            main: false,
            focus: false,
            context: false,
            brush: false,
            focusBrush: false,
            legend: false,
            scales: {
                'left': {
                    'top': false,
                    'opposate': false
                },
                'right': {
                    'top': false,
                    'opposate': false
                }
            },
            commands: false,
            date: {
                from: false,
                until: false
            }
        };

        //TODO merge this.scales, this.container.scales and this.current
        this.current = {
            'left': {
                'top': false,
                'opposate': false
            },
            'right': {
                'top': false,
                'opposate': false
            }
        };
    };

    /**
     * Initialize the chart
     * @param {DOMElement} container - the main container DOMElement
     * @param {Object} options - Options passed by the server
     */
    DashboardChart.prototype.init = function(container, options){
        //load saved conf
        //set brush state
        options.conf.brushstart = Number(options.conf.brushstart);
        options.conf.brushend = Number(options.conf.brushend);
        if(options.conf.brushstart)
            this.conf.brushstart = new Date(options.conf.brushstart);

        if(options.conf.brushend)
            this.conf.brushend = new Date(options.conf.brushend);

        //mode and log
        options.conf.log = Number(options.conf.log);
        if(options.conf.mode) this.conf.mode = options.conf.mode;
        if(options.conf.log) this.conf.log = options.conf.log;

        //timeline
        options.conf.fromdate = Number(options.conf.fromdate);
        options.conf.untildate = Number(options.conf.untildate);

        if(options.conf.fromdate < 0){
            this.conf.fromDate = new Date(new Date().getTime() + options.conf.fromdate);
            this.conf.untilDate = false;
        }
        else{
            if(options.conf.fromdate)
                this.conf.fromDate = new Date(options.conf.fromdate);
            if(options.conf.untildate)
                this.conf.untilDate = new Date(options.conf.untildate);
        }

        //update globale timeline
        DashboardManager.timeline.update(this.conf.fromDate, this.conf.untilDate);

        this.container.main = jQuery(container);
        this.id = options.id;
        this.setBox(options);
        this.buildScale();
        this.buildContainers(container);
        this._buildCommands();
        this.fetchUnits(function(){
            // Once the units are available, show the "add" form 
            // if this widget does not contain any data source yet
            if(!Object.keys(options.conf.probes).length) {
                this.toogleAddPanel();
            }
        }.bind(this));
        this.buildPanel();

        //WIP: setup tooltips
        this.tooltips = new Tooltips();

        this.container.main.on('mousemove',function(e){
            var target = e.target;
            var title = target.getAttribute('data-title');
            if(!title){
                this.tooltips.toogle(false);
            }else{
                var host = DashboardProbes.extractHost(title);
                var service = DashboardProbes.extractService(title);
                if(service === '__HOST__') service = '';
                var probe = host.concat('.',service);
                var date = target.getAttribute('data-date');
                var value = target.getAttribute('data-value');
                var template = [{
                    'tag': 'div',
                    'attr': { 'class': 'probetooltip'},
                    'childs': [
                        {
                            'tag': 'p',
                            'childs': [
                                {'tag': 'label', 'text': 'Host'},
                                {'tag': 'span', 'text': host}
                            ]
                        },{
                            'tag': 'p',
                            'childs': [
                                {'tag': 'label', 'text': 'Service'},
                                {'tag': 'span', 'text': service}
                            ]
                        },{
                            'tag': 'p',
                            'childs': [
                                {'tag': 'label', 'text': 'Probe'},
                                {'tag': 'span', 'text': probe}
                            ]
                        },{
                            'tag': 'p',
                            'childs': [
                                {'tag': 'label', 'text':'Date'},
                                {'tag': 'span', 'text': date}
                            ]
                        },{
                            'tag': 'p',
                            'childs': [
                                {'tag': 'label', 'text':'value'},
                                {'tag': 'span', 'text': value}
                            ]
                        }
                    ]
                }];
                this.tooltips.show(template,target);
            }
            return true;
        }.bind(this));

        //Handle legend things ... and ... stuffs...
        this.legendManager = new Legends(this.container.legend,this.conf.width);
        this.legendManager.extend = function(){
            this.updateBoxSize();
        }.bind(this);

        // For the rest of the initialization we need the probes data
        // to be ready; the callback here will be called when it is
        DashboardProbes.onMetricsReady(function() {
            this.probes = options.conf.probes;
            //toogle the spinner if probes
            if(Object.keys(this.probes).length){
                this.toogleSpinner(this.container.main);
    
                for(var s in options.conf.scales)
                    this.addScale(s,options.conf.scales[s]);
    
                var order = 0;
                for(var p in this.probes){
                    order++;
                    //this.probes[p].stacked = Boolean(eval(this.probes[p].stacked)); // Really ???
                    this.probes[p].stacked = this.probes[p].stacked === '1' ||
                                             this.probes[p].stacked === 'true' ||
                                             this.probes[p].stacked === 1 ||
                                             this.probes[p].stacked === true;
    
                    if(!this.probes[p]['order']) this.probes[p]['order'] = order;
                    if(this.probes[p].order > this.counter) this.counter = this.probes[p].order;
    
                    DashboardProbes.addProbe(p);
                    this.legends[p] = this.legendManager.addLegend({ 
                        'name': p,
                        'color': this.probes[p].color
                    });
    
                    this.legendManager.getProbeContainer(p).on('click',function() {
                        this.context.moveOrderToTop(this.probe);
                    }.bind({'context': this, 'probe': p}));
                }
                this.counter = order;
            }
    
            //draw the legend and resize the box
            var setLegend = function() {
                var check = this.legendManager.redraw();
                if(!check){
                    setTimeout(setLegend.bind(this),1000);
                    return;
                }
                this.updateBoxSize();
            };
            setLegend.call(this);
    
            //add listeners to the probe worker to update this chart on updates
            DashboardProbes.worker.on('cursor',this.showCursor.bind(this));
            DashboardProbes.worker.on('fetch', function() {
                this.container.main.parent().find('.refresh').attr('class','refresh');
                DashboardProbes.worker.postMessage([6,{
                    'probes': this.probes,
                    'start': this.conf.fromDate,
                    'end': this.conf.untilDate,
                    'mode': this.conf.mode
                },this.id]);
            }.bind(this), this.id);
            DashboardProbes.worker.on('predict',function(data){
                this.predict.set(data);
                //update scale domains
                for(var entry in data){
                    if(!data[entry]) continue;
                    var range = [false,false];
                    for(var d in data[entry].values){
                        if(data[entry].values[d][1] > range[1]) range[1] = data[entry].values[d][1];
                        if(typeof range[0] === 'boolean' || range[0] > data[entry].values[d][3]) range[0] = data[entry].values[d][3];
                    }
                    this.scales[this.probes[entry].scale].updateDomain({'range': range});
                }
                this.redraw();
            }.bind(this),this.id);
            DashboardProbes.worker.on('get', function(data){
                var stacked = {};
                var probes = this.probes;
                var entry;
                this.buildScale();
                this.setDomain(data);
                for(entry in data) {
                    if(!data[entry] || !probes[entry]) continue;
                    if(probes[entry].stacked){
                        stacked[probes[entry].scale] = stacked[probes[entry].scale] || {};
                        stacked[probes[entry].scale][entry] = probes[entry];
                    }
                }
                for(entry in stacked) {
                    stacked[entry]._stackedData = DashboardProbes.getStackedData(stacked[entry],data);
                    if(stacked[entry]._stackedData.length)
                        this.scales[entry].updateDomain(stacked[entry]._stackedData[stacked[entry]._stackedData.length - 1]);
                }
    
                this.redraw(data);
                this.buildAxis();
                if(this.conf.brushstart && this.conf.brushend){
                    var context = this.axis.x2.domain();
                    setTimeout(function(){
                        this.container.brush.extent([this.conf.brushstart, this.conf.brushend]);
                        this.container.context.select('.x.brush').call(this.container.brush);
                        this.axis.x.domain([this.conf.brushstart, this.conf.brushend]);
    
                        DashboardProbes.worker.postMessage([8, {
                            'probes': this.probes,
                            'contextTimeline': [context[0].getTime(),context[1].getTime()],
                            'focusTimeline': [this.conf.brushstart.getTime(),this.conf.brushend.getTime()],
                            'mode': this.conf.mode
                        },this.id]);
                    }.bind(this),500);
                }
            }.bind(this), this.id);
            DashboardProbes.worker.on('aggregate',function(data){
                var stacked = {};
                var entry;
                for(entry in data){
                    var probe = this.probes[entry];
                    if(probe.stacked){
                        stacked[probe.scale] = stacked[probe.scale] || {};
                        stacked[probe.scale][entry] = data[entry];
                    }
                }
                //TODO: Add a method to generate stacked arrays to prevent DRY.
                for(entry in stacked) {
                    var stackedData = DashboardProbes.getStackedData(stacked[entry],data);
                    if(stackedData.length){
                        var i = 0;
                        for(var sEntry in stacked[entry]){
                            data[sEntry].values = stackedData[i];
                            //if(this.content[p])
                            //    this.content[p].redraw(stackedData[i]);
                            i++;
                        }
                    }
                }
                //prevent any glitch if the worker havn't returned all probes for any reason
                for(entry in this.currentData) {
                    if(!data[entry]){
                        data[entry] = this.currentData[entry];
                    }
                }
                this.currentData = data;
                if(this.needAutoScale) this.autoScale();
                else{
                    this.soft_redraw();
                }
            }.bind(this),this.id);
    
            //main timeline events
            jQuery('#dashboard-global-timeline').on('timeline.update',function(e,start,end){
                var domain = this.axis.x2.domain();
                this.conf.brushstart = start;
                this.conf.brushend = end;
                if(start >= domain[0] && end <= domain[1]){
                    this.axis.x.domain([start,end]);
    
                    for(var c in this.content)
                        this.content[c].redraw();
                    this.drawLogs();
                    this.container.focus.select('.x.axis').call(this.axis.xAxis);
                    this.drawGrid();
                    this.container.brush.extent([start,end]);
                    this.container.context.call(this.container.brush);
    
                    //check if require to update scale range
                    DashboardProbes.worker.postMessage([8,{
                        'probes': this.probes,
                        'contextTimeline': [domain[0].getTime(),domain[1].getTime()],
                        'focusTimeline': [start.getTime(),end.getTime()],
                        'mode': this.conf.mode
                    },this.id]);
                }else{
                    if(start < domain[0])
                        this.updateFromDate(start.getTime());
                    if(end > domain[1])
                        this.updateUntilDate(end.getTime());
                    domain = this.axis.x2.domain();
                    if(start !== domain[0] || end !== domain[1]){
                        this.container.brush.extent([start,end]);
                        this.container.context.call(this.container.brush);
                        //check if require to update scale range
                        DashboardProbes.worker.postMessage([8,{
                            'probes': this.probes,
                            'contextTimeline': [domain[0].getTime(),domain[1].getTime()],
                            'focusTimeline': [start.getTime(),end.getTime()],
                            'mode': this.conf.mode
                        },this.id]);
                    }
                }
            }.bind(this));
    
            //logs return event
            DashboardProbes.worker.on('logs',function(data){
                //flush cache
                this._stackedLogsCache = {};
    
                this.logs = this.logs || {};
                for(var host in data){
                    this.logs[host] = this.logs[host] || {};
                    for(var service in data[host])
                        this.logs[host][service] = data[host][service];
                }
                this.drawLogs();
            }.bind(this),this.id);
    
            //TODO: maybe a global call should be done after all widget init instead?
            DashboardProbes.worker.postMessage([3,{
                'probes': Object.keys(this.probes),
                'start': (this.conf.fromDate) ? this.conf.fromDate.getTime() : false
            },this.id]);
        }.bind(this));
    };

    /**
     * Showup the spinner
     * @param {$Element} container - the container which will show the spinner
     */
    DashboardChart.prototype.toogleSpinner = function(container){
        var spinner = jQuery('<img width="16" height="16" alt="loading" class="spinner" src="/static/images/jstree/throbber.gif" />');
        container.append(spinner);
    };

    /**
     * Get available units from the server
     */
    DashboardChart.prototype.fetchUnits = function(callback){
        this.units.fetchUnits(callback);
    };

    /**
     * Define the boxsize for containers (focus, context and legend).
     * @param {Object} settings - widget configuration
     */
    DashboardChart.prototype.setBox = function(settings){
        var chartMargin = this.conf.chartMargin;
        var trackMargin = this.conf.trackMargin;

        this.conf.containerHeight = DashboardManager.getPartHeight(settings.height);
        this.conf.containerWidth = DashboardManager.getPartWidth(settings.width);

        //TODO: move hardcoded data elsewhere!
        this.conf.trackHeight = 40;

        chartMargin.bottom += this.conf.trackHeight + trackMargin.top + trackMargin.bottom;

        this.conf.chartHeight = this.conf.containerHeight - chartMargin.top - chartMargin.bottom - 25;
        this.conf.trackMargin.top += this.conf.chartHeight + chartMargin.top;

        this.conf.width = this.conf.containerWidth - chartMargin.left - chartMargin.right;
    };

    /**
     * Build d3 axis objects
     */
    DashboardChart.prototype.buildAxis = function() {
        // Create x axis generators
        var maxTicks = Math.floor(this.conf.width / 80);
        this.axis.xAxis = d3.svg.axis().ticks(maxTicks).scale(this.axis.x).orient('bottom');
        this.axis.xAxis2 = d3.svg.axis().ticks(maxTicks).scale(this.axis.x2).orient('bottom');

        this.container.focus.select('.x.axis').call(this.axis.xAxis);
        this.container.context.select('.x.axis').call(this.axis.xAxis2);

        //draw ladders
        if(this.current['left']['top'] && this.scales[this.current['left']['top']])
            this.container.focus.select('.y.axis').call(this.scales[this.current['left']['top']].getAxis());
        if(this.current['right']['top'] && this.scales[this.current['right']['top']])
            this.container.focus.select('.y.axis.right').call(this.scales[this.current['right']['top']].getAxis());
        if(this.opposate){
            if(this.current['left']['opposate'] && this.scales[this.current['left']['opposate']])
                this.container.focus.select('.y.axis.reversed').call(this.scales[this.current['left']['opposate']].getAxis());
            if(this.current['right']['opposate'] && this.scales[this.current['right']['opposate']])
                this.container.focus.select('.y.axis.reversed.right').call(this.scales[this.current['right']['opposate']].getAxis());

            //remove 0 entry to avoid overlap
            if(this.current['left']['opposate'] && this.current['left']['top'])
                this.container.focus.select('.y.axis.reversed').select('g').remove();
            if(this.current['right']['opposate'] && this.current['right']['top'])
                this.container.focus.select('.y.axis.reversed.right').select('g').remove();
        }
        this.drawGrid();
    };

    /**
     * Draw the background grid
     */
    DashboardChart.prototype.drawGrid = function() {
        var container = this.container.grid;
        var x= this.axis.x;

        //vertical lines
        var vert = x.ticks();
        var v = container.selectAll('.vert_grid').data(vert);
        v.exit().remove();
        v.enter().append('line').attr('class','vert_grid').attr('stroke','grey').attr('y1',0).attr('opacity','0.5').attr('stroke-width',1.15);
        v.attr('x1',function(d){ return x(d); }).attr('x2',function(d){ return x(d);}).attr('y2', this.conf.chartHeight);

        //horizontal lines
        var values = [];
        var y, ticks, i, len;
        if(this.current['left']['top'] && this.scales[this.current['left']['top']]){
            y = this.scales[this.current['left']['top']].y;
            ticks = y.ticks(5);
            for(i = 0, len = ticks.length; i<len;i++)
                values.push(y(ticks[i]));
        }else if(this.current['right']['top'] && this.scales[this.current['right']['top']]){
            y = this.scales[this.current['right']['top']].y;
            ticks = y.ticks(5);
            for(i = 0, len = ticks.length; i<len;i++)
                values.push(y(ticks[i]));
        }
        if(this.current['left']['opposate'] && this.scales[this.current['left']['opposate']]){
            y = this.scales[this.current['left']['opposate']].y;
            ticks = y.ticks(5);
            for(i = 0, len = ticks.length; i<len;i++)
                values.push(y(ticks[i]));
        }else if(this.current['right']['opposate'] && this.scales[this.current['right']['opposate']]){
            y = this.scales[this.current['right']['opposate']].y;
            ticks = y.ticks(5);
            for(i = 0, len = ticks.length; i<len;i++)
                values.push(y(ticks[i]));
        }

        var h = container.selectAll('.hor_grid').data(values);
        h.exit().remove();
        h.enter().append('line').attr('class','hor_grid').attr('stroke','grey').attr('x1',0).attr('opacity','0.5').attr('stroke-width',1.15);
        h.attr('y1',function(d){ return d; }).attr('y2',function(d){ return d;}).attr('x2', this.conf.width);
    };

    /**
     * Add a new scale
     * @param {String} name    - The scale name
     * @param {Object} options - Scale configuration
     */
    DashboardChart.prototype.addScale = function(name, options) {
        if(!!options && options.reversed === 'true' && !this.opposate) {
            this.opposate = true;
            for(var s in this.scales){
                this.scales[s].height /= 2;
                this.scales[s].trackHeight /=2;
                this.scales[s].build(this.conf.log);
            }
        }

        var height, trackHeight;
        if(!this.opposate) {
            height = this.conf.chartHeight - 22;
            trackHeight = this.conf.trackHeight;
        }
        else {
            height = (this.conf.chartHeight - 22) / 2;
            trackHeight = this.conf.trackHeight / 2;
        }
        if(!this.scales[name]){
            this.scales[name] = new DashboardChartScale(name);
            this.scales[name].height = height;
            this.scales[name].trackHeight = trackHeight;
        }
        if(options) {
            this.scales[name].set(options);
            if(options.reversed === 'true'){
                if(options.orient && options.orient === 'right' && !this.current['right']['opposate']) {
                    this.current['right']['opposate'] = name;
                    this._enableSwitchButton('right','opposate',name);
                }
                else if(!this.current['left']['opposate'] && options.orient !== 'right') {
                    this.current['left']['opposate'] = name;
                    this._enableSwitchButton('left','opposate',name);
                }
            }
            else if(options.orient && options.orient === 'right' && !this.current['right']['top']) {
                this.current['right']['top'] = name;
                this._enableSwitchButton('right','top',name);
            }
            else if(options.orient === 'left' && !this.current['left']['top']) {
                this.current['left']['top'] = name;
                this._enableSwitchButton('left','top',name);
            }
        }
        else if(!this.current['left']['top']){
            this.current['left']['top'] = name;
            this._enableSwitchButton('left','top',name);
        }
        this.scales[name].build(this.conf.log);
        return this.scales[name];
    };

    /**
     * Build d3 scales, which are used for convertion between date/value and coord.
     */
    DashboardChart.prototype.buildScale = function(){
        // Create scales and configure their ranges
        this.axis.x = d3.time.scale().range([0, this.conf.width]);
        this.axis.x2 = d3.time.scale().range([0, this.conf.width]);
        for(var i in this.scales)
            this.scales[i].build(this.conf.log);
    };

    /**
     * Deffine the domain for each scale.
     * @param {Object} data - probes data
     */
    DashboardChart.prototype.setDomain = function(data){
        //TODO: Find a way to loop in this.scales only once.
        for(var i in this.scales){
            this.scales[i].min = 0;
            this.scales[i].max = 0;
            this.scales[i].boundedProbe = 0;
        }

        //TODO: nasty but eitherway if no data shit happens...
        var x = { 'min': Date.now() - (3600000 * 24 * 7), 'max': 0};

        for(var d in data){
            //Todo find and a cleaner way
            if(!(d in this.probes))
                continue;
            var time = [data[d].start,data[d].end];
            if(x.min > time[0]) x.min = time[0];
            if(x.max < time[1]) x.max = time[1];

            var scale = this.scales[this.probes[d].scale];
            scale.boundedProbe++;
            scale.updateDomain(data[d]);
        }

        //predict
        var predict = this.predict.getAll(x.max);
        for(d in data){
            if(predict[d]){
                scale = this.scales[this.probes[d].scale];
                var min = false;
                var max = false;
                for(var p in predict[d]){
                    for(i in predict[d][p]){
                        var v = predict[d][p][i].y;
                        min = (typeof(min) === 'boolean' || v < min) ? v : min;
                        max = (typeof(max) === 'boolean' || v > max) ? v : max;
                    }
                }
                var range = [min,max];
                scale.updateDomain({'range': range});
            }
        }

        predict = this.predict.getLastPredictedDate();
        if(predict > x.max) x.max = new Date(predict);

        if(this.conf.fromDate)
            x.min = this.conf.fromDate;
        if(this.conf.untilDate)
            x.max = this.conf.untilDate;

        this.axis.x2.domain([x.min, x.max]);
        //update global timeline if needed
        DashboardManager.timeline.update(x.min, x.max);

        if(this.container.brush.empty())
            this.axis.x.domain([x.min, x.max]);
        else
            this.brushed();

        if(this.conf.brushstart && this.conf.brushend){
            this.container.brush.extent([this.conf.brushstart, this.conf.brushend]);
            this.container.context.select('.x.brush').call(this.container.brush);
            this.axis.x.domain([this.conf.brushstart, this.conf.brushend]);
        }

        this.container.main.trigger('init.dashboard.onoc',[x.min, x.max]);
        this.container.brush.x(this.axis.x2);
        this.container.focusBrush.x(this.axis.x);
        this.buildAxis();
        //update date forms
        this.updateDateForms(this.axis.x2.domain()[0], this.axis.x2.domain()[1]);
    };

    /**
     * Called on resize event
     * @param {Number} width  - Gridster new width value
     * @param {Number} height - Gridster new height value
     */
    DashboardChart.prototype.updateBoxSize = function(width,height){
        var oldWidth = this.conf.width;
        var chartMargin = this.conf.chartMargin;

        if(width && height) {
            this.conf.containerHeight = DashboardManager.getPartHeight(height);
            this.conf.containerWidth = DashboardManager.getPartWidth(width);
        }

        this.conf.width = this.conf.containerWidth - chartMargin.left - chartMargin.right;

        //legend
        if(oldWidth !== this.conf.width)
            this.legendManager.setNewWidth(this.conf.width);
        this.container.legend.attr('transform','translate('+this.conf.chartMargin.left+','+ (this.conf.containerHeight - this.legendManager.getCurrentHeight()) +')');

        this.conf.chartHeight = this.conf.containerHeight - chartMargin.top - chartMargin.bottom - this.legendManager.getCurrentHeight();
        this.conf.trackMargin.top = 40 + this.conf.chartHeight + chartMargin.top;

        //main
        var svg = this.container.main.context.getElementsByTagName('svg')[0];
        svg.setAttribute('width', this.conf.width + this.conf.chartMargin.left + this.conf.chartMargin.right);
        svg.setAttribute('height', this.conf.containerHeight);

        //clippath
        var clip = svg.getElementById('clip_'+this.id).getElementsByTagName('rect')[0];
        clip.setAttribute('width', this.conf.width);
        clip.setAttribute('height', this.conf.chartHeight);

        clip = svg.getElementById('clip_top_'+this.id).getElementsByTagName('rect')[0];
        clip.setAttribute('width', this.conf.width);
        clip.setAttribute('height', (this.conf.chartHeight - 22) / 2);

        clip = svg.getElementById('clip_bottom_'+this.id).getElementsByTagName('rect')[0];
        clip.setAttribute('width', this.conf.width);
        clip.setAttribute('height', (this.conf.chartHeight - 22) / 2);
        clip.setAttribute('y', (this.conf.chartHeight - 22) / 2);

        //axis
        this.container.focus.select('.x.axis').attr('transform','translate(0,'+ this.conf.chartHeight +')');
        this.container.focus.select('.y.axis.right').attr('transform','translate('+ this.conf.width +',0)');
        this.container.focus.select('.y.axis.right.reversed').attr('transform','translate('+ this.conf.width +',0)');

        //context
        this.container.context.attr('transform','translate(' + this.conf.trackMargin.left + ',' + this.conf.trackMargin.top + ')');

        //scales
        var trackHeight = 0;
        if(!this.opposate) {
            height = this.conf.chartHeight - 22;
            trackHeight = this.conf.trackHeight;
        }
        else {
            height = (this.conf.chartHeight - 22) / 2;
            trackHeight = this.conf.trackHeight / 2;
        }
        for(var s in this.scales) {
            this.scales[s].height = height;
            this.scales[s].trackHeight = trackHeight;
        }

        //panel, force close event to reinitialize panel size
        if(!this.panelUp) {
            this.panelUp = true;
            this.tooglePanel();
        }

        //commands
        this.container.commands.attr('transform','translate(' + (this.conf.containerWidth - this.conf.chartMargin.left - 85)+',0)');

        //focus logs
        this.container.logs.attr('transform','translate('+this.conf.chartMargin.left+','+this.conf.chartMargin.top+')');
        this.container.logs.select('rect').attr('y', this.conf.chartHeight - 23).attr('width',this.conf.width - 2);
        this.container.logs.selectAll('circle').attr('cy', this.conf.chartHeight - 12);
        this.container.logs.selectAll('text').attr('y', this.conf.chartHeight - 7);
        this.container.logs.selectAll('.logs-bar').attr('height',this.conf.chartHeight - 23);

        //switchButtons
        this.container.scales.left.opposate.attr('transform','translate(-88,'+( this.conf.chartHeight + 8) + ')');
        this.container.scales.right.opposate.attr('transform','translate('+(this.conf.width + 8 )+','+( this.conf.chartHeight + 8)+')');
        this.container.scales.right.top.attr('transform','translate('+(this.conf.width + 8)+',-28)');

        //alert if any active
        var alert = this.container.focus.select('.alert');
        if(!alert.empty())
            alert.attr('transform','translate('+((this.conf.width - (alert[0][0].getBBox().width)) /2)+','+(this.conf.chartHeight/2 + 20)+')');

        //redefine scales
        this.buildScale();
        this.setDomain(this.data);

        //cursor and brush
        this.getCursor().select('rect').attr('height',this.conf.chartHeight);
        //focus brush
        this.container.focus.select('.brush').selectAll('rect').attr('height',this.conf.chartHeight + 7);
        this.container.focus.select('.brush').select('.background').attr('width',this.conf.width);
        //context brush
        var values = this.container.brush.extent();
        var brushWidth = this.container.context.select('.brush').select('.extent').attr('width');
        var brushPosX = this.container.context.select('.brush').select('.extent').attr('x');
        this.container.context.select('.brush').selectAll('rect').attr('height',this.conf.trackHeight + 7);
        this.container.context.select('.brush').select('.extent').attr('width', brushWidth * this.conf.width/oldWidth).attr('x', brushPosX * this.conf.width/oldWidth);
        this.container.context.select('.brush').select('.background').attr('width',this.conf.width);
        this.container.brush.extent(values);

        //redraw ??? there should be another way...
        this.redraw();
        if(this.currentData){
            //TODO: copy-pasta from the aggregate event method, we should rewrite all this part.
            var data = this.currentData;
            var stacked = {};
            for(var p in data){
                var probe = this.probes[p];
                if(!probe.stacked && typeof this.content[p] !== 'undefined')
                    this.content[p].redraw(data[p].values);
                else{
                    stacked[probe.scale]= stacked[probe.scale] || {};
                    stacked[probe.scale][p]= data[p];
                }
            }
            for(s in stacked){
                var stackedData = DashboardProbes.getStackedData(stacked[s],data);
                if(stackedData.length){
                    var i = 0;
                    for(p in stacked[s]){
                        if(this.content[p])
                            this.content[p].redraw(stackedData[i]);
                        i++;
                    }
                }
            }
        }
    };

    /**
     * Construct parts containers
     * @param {DOMElement} container - Main container DOMElement
     * TODO: Refactor
     */
    DashboardChart.prototype.buildContainers = function(container) {
        var $container = jQuery(container);
        $container.addClass('basicchart');
        var svg = d3.select(container).append('svg')
            .attr('width', this.conf.width + this.conf.chartMargin.left + this.conf.chartMargin.right)
            .attr('height', this.conf.chartHeight + this.conf.chartMargin.top + this.conf.chartMargin.bottom)
            .attr('class', 'basicchart');

        //clipPath defs
        var defs = svg.append('defs');
        defs.append('clipPath')
            .attr('id', 'clip_'+this.id)
            .append('rect')
            .attr('width', this.conf.width)
            .attr('height', this.conf.chartHeight);

        defs.append('defs').append('clipPath')
            .attr('id', 'clip_top_'+this.id)
            .append('rect')
            .attr('width', this.conf.width)
            .attr('height', (this.conf.chartHeight - 22 )/ 2);

        defs.append('defs').append('clipPath')
            .attr('id', 'clip_bottom_'+this.id)
            .append('rect')
            .attr('width', this.conf.width)
            .attr('height', (this.conf.chartHeight - 22 )/ 2)
            .attr('y', (this.conf.chartHeight - 22 )/ 2);


        //commands and datepicker selectors
        this.container.commands = $container.parent().find('.widget-commands');
        this.container.date = {
            'from': $container.parent().find('.datePicker.from'),
            'until': $container.parent().find('.datePicker.until'),
        };

        new Calendar(this.container.date.from, this.updateFromDate.bind(this), $container);
        new Calendar(this.container.date.until, this.updateUntilDate.bind(this), $container);

        //prevent drag into the svg to trigger the drag event from gridster
        container.addEventListener('mousedown',function(e){
            e.stopPropagation();
        },false);

        var grid = svg.append('g')
            .attr('transform', 'translate(' + this.conf.chartMargin.left + ',' + this.conf.chartMargin.top + ')');
        this.container.grid = grid;

        // Focus is the top chart (the zoomed-in one)
        var focus = svg.append('g')
            .attr('transform', 'translate(' + this.conf.chartMargin.left + ',' + this.conf.chartMargin.top + ')')
            .attr('class', 'parts-focus');

        focus.append('g')
            .attr('class', 'x axis')
            .attr('transform', 'translate(0,' + this.conf.chartHeight + ')');

        focus.append('g')
            .attr('class', 'y axis');

        focus.append('g')
            .attr('class', 'y axis reversed');

        focus.append('g')
            .attr('class', 'y axis right')
            .attr('transform','translate('+this.conf.width+',0)');

        focus.append('g')
            .attr('class', 'y axis right reversed')
            .attr('transform','translate('+this.conf.width+',0)');

        this.container.focus = focus;

        //logs and infobox
        var logs = svg.append('g').attr('class','logs')
            .attr('clip-path', 'url(#clip_'+this.id+')')
            .attr('transform','translate('+this.conf.chartMargin.left+','+this.conf.chartMargin.top+')');
        logs.append('rect')
            .attr('width',this.conf.width - 4)
            .attr('height',21)
            .attr('x',2)
            .attr('y',this.conf.chartHeight - 21)
            .attr('fill','#000')
            .attr('fill-opacity',0.5);
        this.container.logs = logs;

        //Add the 'mousemove' event listener
        //TODO: Use the "on" event from d3 instead?
        var cursorListener = container.getElementsByClassName('parts-focus')[0];
        cursorListener.addEventListener('mousemove',function(e){
            var offset = e.target.offsetLeft || 0, parent = e.target;

            while(parent) {
                if(parent.offsetLeft && !isNaN(parent.offsetLeft))
                    offset+= parent.offsetLeft;
                parent = parent.parentNode;
            }

            var date = this.axis.x.invert(e.pageX - offset - this.conf.chartMargin.left);
            this.cursorPos = date;
            DashboardProbes.worker.postMessage([9,date]);
        }.bind(this),true);

        // Context displays the overview chart
        var context = svg.append('g')
            .attr('transform', 'translate(' + this.conf.trackMargin.left + ',' + this.conf.trackMargin.top + ')');

        // X axis legend for the overview
        context.append('g')
            .attr('class', 'x axis')
            .attr('transform', 'translate(0,' + this.conf.trackHeight + ')');

        //legend
        var legend = svg.append('g')
            .attr('transform', 'translate('+this.conf.chartMargin.left+',' + (this.conf.containerHeight - 42) + ')');
        this.container.legend = legend;

        // Zooming cursor on the overview
        var brush = d3.svg.brush()
            .x(this.axis.x2)
            .on('brush', this.brushed.bind(this),true);
        brush.on('brushstart',function() {
            var xDomain = this.axis.x.domain();
            var x2Domain = this.axis.x2.domain();
            DashboardProbes.worker.postMessage([8, {
                'probes': this.probes,
                'contextTimeline': [xDomain[0].getTime(), xDomain[1].getTime()],
                'focusTimeline': [x2Domain[0].getTime(), x2Domain[1].getTime()],
                'mode': this.conf.mode
            },this.id]);
        }.bind(this));
        brush.on('brushend',function() {
            var x2Domain = this.axis.x2.domain();
            var xDomain = this.axis.x.domain();
            this.needAutoScale = true;

            //... Dunno why in some case the pointer-event is stuck to "none".
            this.container.context.select('.x.brush').attr('style','pointer-events:all;');

            //save brush state
            var data = {
                'brushstart': (this.conf.brushstart) ? this.conf.brushstart.getTime() : false,
                'brushend': (this.conf.brushend) ? this.conf.brushend.getTime() : false
            };
            DashboardManager.savePartData({
                'id': this.id,
                'conf': JSON.stringify(data)
            });

            DashboardProbes.worker.postMessage([8,{
                'probes': this.probes,
                'contextTimeline': [x2Domain[0].getTime(),x2Domain[1].getTime()],
                'focusTimeline': [xDomain[0].getTime(),xDomain[1].getTime()],
                'mode': this.conf.mode
            },this.id]);
        }.bind(this));

        this.container.brush = brush;
        context.append('g')
            .attr('class', 'x brush')
            .call(brush)
            .selectAll('rect')
            .attr('y', -6)
            .attr('height', this.conf.trackHeight + 7);

        //focus zooming cursor
        brush = d3.svg.brush()
            .x(this.axis.x)
            .on('brushend', function() {
                var max = this.axis.x.domain();
                if(brush.empty())
                    return;
                var range = brush.extent();
                //prevent to go below 10min range
                if(range[1] - range[0] < 600000){
                    var gap = Math.round((600000 - (range[1] - range[0]))/2);
                    range[0] = new Date((range[0].getTime() - gap));
                    range[1] = new Date((range[1].getTime() + gap));
                }
                this.axis.x.domain(range);
                for(var c in this.content)
                    this.content[c].redraw();
                this.drawLogs();

                this.container.focus.select('.x.axis').call(this.axis.xAxis);
                this.drawGrid();

                brush.clear();
                this.container.focus.select('.x.brush').call(brush);

                this.container.brush.extent(range);
                this.container.context.call(this.container.brush);
                DashboardProbes.worker.postMessage([8,{
                    'probes': this.probes,
                    'contextTimeline': [max[0].getTime(),max[1].getTime()],
                    'focusTimeline': [range[0].getTime(),range[1].getTime()],
                    'mode': this.conf.mode
                },this.id]);

                //save brush state
                this.conf.brushstart = (range[0].getTime() !== this.axis.x.domain()[0]) ? range[0] : false;
                this.conf.brushend = (range[1].getTime() !== this.axis.x.domain()[1]) ? range[1] : false;

                var data = {
                    'brushstart': (this.conf.brushstart) ? this.conf.brushstart.getTime() : false,
                    'brushend': (this.conf.brushend) ? this.conf.brushend.getTime() : false
                };
                DashboardManager.savePartData({
                    'id': this.id,
                    'conf': JSON.stringify(data)
                });

            }.bind(this),true);
        this.container.focusBrush = brush;
        focus.append('g')
            .attr('class', 'x brush')
            .call(brush)
            .selectAll('rect')
            .attr('y', -6)
            .attr('height', this.conf.chartHeight + 7);

        //wheel zoom
        focus.on('wheel',this.zoom.bind(this));

        this.container.context = context;
    };

    /**
     * Build a scale-switch button
     * @param {String} orient    - Targeted scale orient
     * @param {String} direction - Targeted scale direction
     */
    DashboardChart.prototype._buildScaleSwitchButton = function(orient,direction){
        var left = (orient === 'left') ? -88: this.conf.width + 8;
        var top = (direction === 'top') ? -28 : this.conf.chartHeight + 8;
        var current = this.current[orient][direction];

        var button = this.container.focus.append('g')
            .attr('class','chartButton')
            .attr('transform','translate('+left+','+top+')');

        var unit = (current) ? this.scales[current].unit : false;
        button.append('rect')
            .attr('width','80')
            .attr('height','20')
            .attr('fill','#000')
            .attr('data-tooltip','Unit displayed on this scale, click to switch to the next one.')
            .attr('stroke','#57b4dc');
        if(!current) 
            button.attr('style','display: none;');
        button.append('text')
              .text(unit)
              .attr('fill','#57b4dc')
              .attr('text-anchor','middle')
              .attr('x',41)
              .attr('y',12)
              .attr('pointer-events','none');

        button.on('click',function() {
            this.switchScale(orient,direction);
        }.bind(this));

        this.container.scales[orient][direction] = button;
    };

    /**
     * Enable switch button
     * @param {String} orient    - Orient position (left|right)
     * @param {String} direction - Direction (top|bottom)
     * @param {String} name      - Active scale name
     */
    DashboardChart.prototype._enableSwitchButton = function(orient,direction,name){
        var container = this.container.scales[orient][direction];
        if(!name){
            container.attr('style','display:none;');
            return;
        }
        container.attr('style','');
        container.select('text').text(this.scales[name].unit);
    };

    /**
     * Build global commands (log, aggregation mode etc...)
     */
    DashboardChart.prototype._buildCommands = function(){
        this.container.commands = this.container.main.parent().find('.widget-commands');
        var container = this.container.commands;

        //refresh
        var refresh = this.container.main.parent().find('.refresh');
        refresh.click(function(e){
            e.target.setAttribute('class','refresh disabled');
            var probes = Object.keys(this.probes);
            var data = {
                'probes': probes
            };
            if(this.conf.fromDate)
                data.start = this.conf.fromDate.getTime();
            if(this.conf.untilDate)
                data.end = this.conf.untilDate.getTime();
            this.toogleSpinner(this.container.main);
            DashboardProbes.worker.postMessage([3,data,this.id]);
        }.bind(this));

        //actions
        var actionsMenu = this.container.main.parent().find('.actions.dropmenu ul');

        //reset
        var button = jQuery('<li class="reset">reset</li>');
        button.click(function() {
            this.conf.brushstart = false;
            this.conf.brushend = false;
            this.container.brush.clear();
            this.container.context.select('.x.brush').call(this.container.brush);

            this.axis.x.domain(this.axis.x2.domain());
            this.buildScale();
            this.setDomain(this.data);
            this.redraw();

            var context = this.axis.x2.domain();
            var focus = this.axis.x.domain();
            DashboardProbes.worker.postMessage([8,{
                'probes': this.probes,
                'contextTimeline': [context[0].getTime(),context[1].getTime()],
                'focusTimeline': [focus[0].getTime(),focus[1].getTime()],
                'mode': this.conf.mode
            },this.id]);

            var data = {
                'brushstart': false,
                'brushend': false
            };
            DashboardManager.savePartData({
                'id': this.id,
                'conf': JSON.stringify(data)
            });

        }.bind(this));
        actionsMenu.prepend(button);

        //clone
        button = jQuery('<li class="clone">duplicate</li>');
        button.click(function() {
            this.toogleDupPanel();
        }.bind(this));
        actionsMenu.prepend(button);

        //edit
        button = jQuery('<li class="edit">edit</li>');
        button.click(function() {
            this.toogleEditPanel();
        }.bind(this));
        actionsMenu.prepend(button);

        //add
        button = jQuery('<li class="add">add</li>');
        button.click(function() {
            this.toogleAddPanel();
        }.bind(this));
        actionsMenu.prepend(button);

        //commands
        //rescale
        button = jQuery('<span class="rescale" title="Fit scales verticaly" data-tooltip="Fit scales verticaly"></span>');
        button.click(this.autoScale.bind(this));
        container.append(button);

        //log
        button = jQuery('<button class="log ' + (this.conf.log ? 'enabled':'disabled') + '" data-tooltip="Set to logarithm mode">log</button>');

        button.click(function() {
            this.conf.log = !this.conf.log;
            this.buildScale();
            this.setDomain(this.data);
            this.redraw();

            var context = this.axis.x2.domain();
            var focus = this.axis.x.domain();
            DashboardProbes.worker.postMessage([8,{
                'probes': this.probes,
                'contextTimeline': [context[0].getTime(),context[1].getTime()],
                'focusTimeline': [focus[0].getTime(),focus[1].getTime()],
                'mode': this.conf.mode
            },this.id]);

            this.container.commands.find('.log').attr('class','log ' + (this.conf.log ? 'enabled':'disabled'));

            DashboardManager.savePartData({
                'id': this.id,
                'conf': JSON.stringify({ 'log': this.conf.log})
            });
        }.bind(this));
        container.append(button);

        //mode
        var modes = ['max','min','avg'];
        button = jQuery('<button class="mode" data-tooltip="Set aggregation rules"></button>');
        button.text(this.conf.mode);

        button.on('click',function() {
            var index = modes.indexOf(this.conf.mode);
            index++;
            if(index === modes.length)
                index = 0;
            this.conf.mode = modes[index];

            this.container.commands.find('.mode').text(this.conf.mode);
            this.container.brush.clear();
            this.container.context.select('.x.brush').call(this.container.brush);
            DashboardProbes.worker.postMessage([6,{
                'probes': this.probes,
                'start': this.conf.fromDate,
                'end': this.conf.untilDate,
                'mode': this.conf.mode
            },this.id]);

            DashboardManager.savePartData({
                'id': this.id,
                'conf': JSON.stringify({'mode': this.conf.mode})
            });
        }.bind(this));
        container.append(button);

        //date
        var dateContainer = this.container.main.parent().find('.widget-header .datemenu');
        var tmp = jQuery('<li>Last year</li>');
        tmp.click(function(){ this.updateFromDate(-3600 * 1000 * 24 * 365);}.bind(this));
        dateContainer.prepend(tmp);

        tmp = jQuery('<li>Current year</li>');
        tmp.click(function(){
            var date = new Date(
                new Date().getFullYear(),
                0,1,1,0
            ).getTime();
            this.conf.untilDate = false;
            this.updateFromDate(date);
        }.bind(this));
        dateContainer.prepend(tmp);

        tmp = jQuery('<li>Last 30 days</li>');
        tmp.click(function(){ this.updateFromDate(-3600 * 1000 * 24 * 30);}.bind(this));
        dateContainer.prepend(tmp);

        tmp = jQuery('<li>Current month</li>');
        tmp.click(function(){
            var date = new Date(
                new Date().getFullYear(),
                new Date().getMonth(),
                1,1,0
            ).getTime();
            this.conf.untilDate = false;
            this.updateFromDate(date);
        }.bind(this));
        dateContainer.prepend(tmp);


        tmp = jQuery('<li>Last 24 hours</li>');
        tmp.click(function(){ this.updateFromDate(-3600 * 1000 * 24);}.bind(this));
        dateContainer.prepend(tmp);

        //scale switch
        //TODO: DRY: add a method to generate switch button only when needed
        //top left
        this._buildScaleSwitchButton('left','top');

        //top right
        this._buildScaleSwitchButton('right','top');

        // bottom left
        this._buildScaleSwitchButton('left','opposate');

        //bottom right
        this._buildScaleSwitchButton('right','opposate');
    };

    /**
     * Return the next available scale
     * @param {String} orient    - Orientation value (left|right)
     * @param {Boolean} reversed - Direction value
     * @param {String} current   - Current active scale
     * @return false if there is no available scale at the given position
     */
    DashboardChart.prototype.getNextAvailableScale = function(orient,reversed, current){
        var scales = [];

        for(var s in this.scales){
            var scale = this.scales[s];
            if(scale.orient === orient && scale.boundedProbe && scale.reversed === reversed)
                scales.push(s);
        }
        var len = scales.length;
        if(!len) return false;
        var index = scales.indexOf(current);
        index++;
        if(index === len) index = 0;

        return scales[index];
    };

    /**
     * Move to the next available scale if any
     * TODO: meh', a bit messy here, Refactor
     * @param {String} orient    - Switch button orient position (left|right)
     * @param {String} direction - Switch button direction position (top|bottom)
     */
    DashboardChart.prototype.switchScale = function(orient,direction){
        var current = this.current[orient][direction];
        var next = this.getNextAvailableScale(orient,(direction === 'opposate'),current);
        this.current[orient][direction] = next;

        if(!next)
            this.container.scales[orient][direction].attr('style','display:none;');
        this._enableSwitchButton(orient,direction,next);
        this.buildAxis();
    };

    /**
     * Only redraw from existing data.
     */
    DashboardChart.prototype.soft_redraw = function(){
        var data = this.currentData;
        for(var p in data){
            if(typeof this.content[p] !== 'undefined'){
                this.content[p].redraw(data[p].values);
            }
        }
    };

    /**
     * Flush containers and redraw the content.
     * @param {Object} data - Probe's data.
     */
    DashboardChart.prototype.redraw = function(data){
        if(!data && !this.data){
            return;
        }
        if(!data)
            data = this.data;
        else
            this.data = data;
        for(var p in this.content)
            delete this.content[p];

        if(this.container.main.find('.spinner'))
            this.container.main.find('.spinner').remove();

        //remove columns
        this.container.focus.selectAll('.columns').remove();
        this.container.context.selectAll('.columns').remove();

        //remove area
        this.container.focus.selectAll('.chart').remove();
        this.container.context.selectAll('.chart').remove();

        //redraw
        this.draw(data);
    };

    /**
     * Draw everything
     * @param {Object} data - Probe's data.
     */
    DashboardChart.prototype.draw = function(data){
        var probes= this.probes;
        var predicted = this.predict.getAll(Date.now());
        var scale, p, probe, id, type, color, values;

        if(!Object.keys(probes).length)
            return;
        var stacked = {};

        //set the domain
        //TODO: we should set domains only when we received new data from the server or with aggregation events (and no-max mode).
        for(p in data) {
            if(probes[p].stacked) {
                stacked[probes[p].scale] = stacked[probes[p].scale] || {};
                stacked[probes[p].scale][p] = probes[p];
            }
        }

        for(var s in stacked) {
            stacked[s]._stackedData = DashboardProbes.getStackedData(stacked[s],data);
            if(stacked[s]._stackedData.length)
                this.scales[s].updateDomain(stacked[s]._stackedData[stacked[s]._stackedData.length - 1]);
        }

        //draw probes
        var errors = [];
        for(p in data) {
            if(data[p].error) {
                if(this._pending)
                    errors.push(data[p]);
                continue;
            }
            probe = probes[p];
            if(!probe)
                continue;
            id = p;
            scale = probe.scale || 'default';
            if(probe.stacked) continue;

            if(p in this.content){
                this.content[p].redraw();
                continue;
            }

            type = probe.type || 'area';
            color = probe.color || 'red';
            values = data[p].values;

            switch(type){
            case 'column':
                this.addColumn(id, values, color, this.scales[scale].y, this.scales[scale].y2);
                break;
            case 'line':
                this.addLine(id, values, color, this.scales[scale].y, this.scales[scale].y2);
                break;
            case 'area':
                this.addArea(id, values, color, this.scales[scale].y, this.scales[scale].y2);
                break;
            }

            //draw predicted data
            if(predicted && p in predicted)
                this.addPredict(predicted[p],color,values,this.scales[scale].y,p);
        }

        if(errors.length){
            for(var error in errors)
                this.displayAlert(errors[error]);
        }

        //draw logs
        this.drawLogs();

        //draw stacked charts
        for(s in stacked){
            var stackedData = stacked[s]._stackedData;
            var stackedPredict = [];
            scale = this.scales[s];
            if(predicted)
                for(p in stacked[s])
                    if(p in predicted)
                        stackedPredict.push(predicted[p]);

            var layoutPredict = d3.layout.stack();

            if(stackedData.length){
                var i = 0;
                if(predicted){
                    for(i in stackedPredict[0]){
                        var tmp = [];
                        for(var predict in stackedPredict)
                            tmp.push(stackedPredict[predict][i]);

                        tmp = layoutPredict(tmp);

                        for(predict in stackedPredict)
                            stackedPredict[predict][i] = tmp[predict];
                    }
                }

                //draw probes
                for(p in stacked[s]){
                    if(p === '_stackedData')
                        continue;
                    probe = stacked[s][p];
                    id = p;

                    if(p in this.content){
                        this.content[p].redraw();
                        continue;
                    }

                    type = probe.type || 'column';
                    color = probe.color || 'red';
                    values = stackedData[i];

                    switch(type){
                    case 'column':
                        this.addColumn(id, values, color, scale.y, scale.y2);
                        break;
                    case 'area':
                        this.addArea(id, values, color, scale.y, scale.y2);
                        break;
                    default:
                        this.addArea(id, values, color, scale.y, scale.y2);
                    }
                    //draw predicted data
                    if(predicted && p in predicted){
                        this.addPredict(stackedPredict[i],color,values,scale.y,p);
                    }
                    i++;
                }
            }
        }

        //set order
        this.orderProbes();
    };

    /**
     * Clean and save probes order
     */
    DashboardChart.prototype.cleanProbesOrder = function(){
        var tmp = [], counter = 0, conf = { 'probes' : {}};
        for(var p in this.probes) tmp[this.probes[p].order] = p;
        for(var i = 0, len = tmp.length; i<len;i++){
            if(tmp[i]){
                this.probes[tmp[i]].order = counter++;
                conf.probes[tmp[i]] = { 'order' : counter};
            }
        }
        this.counter = counter;
        //save new probes order conf
        var data = {
            'id': this.id,
            'conf': JSON.stringify(conf)
        };
        DashboardManager.savePartData(data);
        this.orderProbes();
    };


    /**
     * Move probe position
     * @param {String} probe - Probe's name
     * @param {Number} move  - Direction of the move (-1 | 1)
     * @return New probe's offset
     */
    DashboardChart.prototype.moveOrder = function(probe,move){
        var target = this.probes[probe], len = this.counter, order = [];
        if(target.order >= len && move > 0) return target.order;
        if(target.order <= 0 && move < 0) return 0;
        for(var p in this.probes) order[this.probes[p].order] = p;
        var newOffset = target.order;
        do{
            newOffset += move;
        }while(!order[newOffset] && newOffset >= order.length && newOffset <= 0);
        if(!order[newOffset]){
            this.probes[probe].order = newOffset;
        }else{
            this.probes[order[newOffset]].order = target.order;
            target.order = newOffset;
        }
        this.cleanProbesOrder();

        return newOffset;
    };

    /**
     * Move probe to top position
     * @param {String} probe - Probe's name
     * @return New probe's offset
     */
    DashboardChart.prototype.moveOrderToTop = function(probe){
        var target = this.probes[probe], len = this.counter;
        if(target.order >= len) return target.order;
        this.probes[probe].order = ++len;
        this.cleanProbesOrder();

        return len;
    };

    /**
     * Sort probes chart elements by order.
     */
    DashboardChart.prototype.orderProbes = function(){
        //TODO: we should rework all the drawing process, use .data to generate g elements and then fill theme with charts
        var data = [];
        for(var p in this.probes) data.push({
            'order': Number(this.probes[p].order),
            'name': 'chart_' + p.split(Config.separator()).join('_')
        });
        this.container.focus.selectAll('.ordered').data(data,function(d) {
            return d ? d.name : this.id;
        }).sort(function(d,e) {
            return d.order - e.order;
        });
    };

    /**
     * Display an alert
     * @param {String} alert - Showup an alert
     */
    DashboardChart.prototype.displayAlert = function(alert){
        var container = this.container.focus.select('.alert');
        var width = alert.length * 8;
        var height = 30;

        if(container.empty()) {
            container = this.container.focus.append('g')
                .attr('class','alert')
                .attr('style','cursor:pointer;')
                .attr('transform','translate('+((this.conf.width - width) /2)+','+(this.conf.chartHeight/2 + 20)+')');

            container.append('rect')
                .attr('width', width)
                .attr('height',height)
                .attr('fill','black')
                .attr('fill-opacity',0.35);

            container.on('click',function(){
                container.remove();
            });
        }
        else {
            if(alert === container.select('text').text())
                return;
            height +=20;
            if(width > Number(container.select('rect').attr('width')))
                container.select('rect').attr('width',width);
            container.select('rect').attr('height',height);
        }
        container.append('text')
            .attr('text-anchor','left')
            .attr('x', 5)
            .attr('y',height/2)
            .attr('fill','white')
            .text(alert);
    };

    /**
     * draw the logs timeline
     * TODO: Pretty useless now, Removeme?
     */
    DashboardChart.prototype.drawLogs = function(){
        var logs = this.logs;
        var stacked = this._getStackedLogs(logs);
        this.placeLogs(stacked);
    };

    /**
     * Build stacked logs array before draw
     * @param {Object} logs - logs data
     */
    DashboardChart.prototype._getStackedLogs = function(logs){
        var range = this.axis.x.invert(7) - this.axis.x.invert(0);
        if(this._stackedLogsCache[range])
            return this._stackedLogsCache[range];
        var stacked = [];
        for(var h in logs){
            for(var s in logs[h]){
                for(var l in logs[h][s]){
                    var log = logs[h][s][l];

                    var orphan = true;
                    for(var i in stacked){
                        if(log.time >= stacked[i].min && log.time <= stacked[i].max) {
                            var hasMatch = true;
                            for(var j = 0, len = stacked[i].logs.length; j<len; j++) {
                                if(log.time === stacked[i].logs[j].time && log.host_name === stacked[i].logs[j].host_name && log.service_description === stacked[i].logs[j].service_description) {
                                    hasMatch = false;
                                    break;
                                }
                            }

                            if(hasMatch) {
                                stacked[i].logs.push(log);
                                if(log.state === 1) stacked[i].warnings++;
                                else if(log.state === 2) stacked[i].errors++;
                            }
                            orphan = false;
                            break;
                        }
                    }
                    if(orphan) stacked.push({
                        'min': log.time - range,
                        'max': log.time + range,
                        'logs': [log],
                        'warnings': (log.state === 1) ? 1:0,
                        'errors': (log.state === 2) ? 1:0
                    });
                }
            }
        }
        this._stackedLogsCache[range] = stacked;
        return stacked;
    };

    /**
     * Place logs
     * @param {Object} logs - Stacked logs
     */
    DashboardChart.prototype.placeLogs = function(logs){
        var container = this.container.logs;
        var height = this.conf.chartHeight;

        var contextContainer = this.container.context.select('.logs');
        if(contextContainer.empty()) contextContainer = this.container.context.append('g').attr('class','logs');
        var logBox = container.selectAll('g.box').data(logs);

        logBox.exit().remove();
        var newBox = logBox.enter().append('g')
            .attr('class','box')
            .attr('style','cursor:pointer;');
        newBox.append('rect')
            .attr('x',9)
            .attr('y',0)
            .attr('width',0)
            .attr('height',height)
            .attr('class','logs-bar');

        newBox.append('circle')
            .attr('cx', 10)
            .attr('cy', height - 12)
            .attr('r',10)
            .attr('stroke','black');

        newBox.append('text')
            .attr('x',10.5)
            .attr('y', height - 7)
            .attr('font-size',15)
            .attr('font-weight','bolder')
            .attr('text-anchor','middle')
            .attr('fill','white')
            .text('!');
        newBox.append('title');

        newBox.on('click', function(d){
            this.toogleLogsPanel(d);
        }.bind(this));
        newBox.on('mouseover',function(){
            d3.select(this).select('rect').attr('width',2);
        });
        newBox.on('mouseout',function(){
            d3.select(this).select('rect').attr('width',0);
        });


        logBox.select('title').text(function(d){
            return d.warnings+' warnings and '+d.errors+' errors';
        });

        logBox.attr('transform',function(d){ return 'translate('+(this.axis.x(new Date(d.min)) - 10)+',0)';}.bind(this));

        logBox.select('circle').attr('fill', '#E63C3E');
        logBox.select('rect').attr('fill', '#E63C3E');
    };

    /**
    * Event method, redraw the focus area when selecting a new interval in the context area
    * @event
    */
    DashboardChart.prototype.brushed = function(){
        if(this.container.brush.empty()){
            this.conf.brushstart = false;
            this.conf.brushend = false;
            this.axis.x.domain(this.axis.x2.domain());
        }else{
            this.conf.brushstart = this.container.brush.extent()[0];
            this.conf.brushend = this.container.brush.extent()[1];
            this.axis.x.domain(this.container.brush.extent());
        }

        this.axis.x.domain(this.container.brush.empty() ? this.axis.x2.domain() : this.container.brush.extent());

        for(var c in this.content)
            this.content[c].redraw();

        this.drawLogs();
        //performance hit here, maybe find an other way to update the xAxis
        this.container.focus.select('.x.axis').call(this.axis.xAxis);
        this.drawGrid();
        //this.updateDateForms(this.axis.x.domain()[0], this.axis.x.domain()[1]);
    };

    /**
     * Place the cursor at the given date position
     * @event
     */
    DashboardChart.prototype.showCursor = function(event){
        var cursor = this.getCursor();
        if(event.date >= this.axis.x.domain()[0] && event.date <= this.axis.x.domain()[1]){
            cursor.attr('transform','translate('+this.axis.x(new Date(event.date))+',0)').attr('display','inherit');
            cursor.select('text').text(new Date(event.date).toLocaleString());
        }else{
            cursor.attr('display','none');
        }
        for(var legend in this.legends){
            if(!this.probes[legend]){
                //console.log(this.id,legend,this.probes,this.legends);
                continue;
            }
            var unit = this.units.get(this.scales[this.probes[legend].scale].unit);
            if(!event.values[legend] && typeof(event.values[legend]) === 'boolean') event.values[legend] = 'unknown';
            this.legends[legend].text(this.units.unitFormat(event.values[legend],unit));
        }
    };

    /**
     * Return the cursor element or create it.
     */
    DashboardChart.prototype.getCursor = function(){
        var cursor = this.container.focus.select('.parts-cursor');
        if(cursor.empty()) cursor = this.createCursor();
        return cursor;
    };

    /**
     * Create the cursor
     */
    DashboardChart.prototype.createCursor = function(){
        var cursor = this.container.focus.append('g').attr('class','parts-cursor');
        cursor.append('rect')
            .attr('x','0')
            .attr('y','0')
            .attr('width','2')
            .attr('height',this.conf.chartHeight);
        cursor.append('text')
            .attr('class','cursor-date')
            .attr('x',0)
            .attr('y',-10)
            .attr('stroke','#ccc')
            .attr('font-weight','lighter')
            .attr('font-size', 9)
            .attr('text-anchor','middle');
        return cursor;
    };

    /**
     * Return an array of paths from a probe to skip part where the probe were inactive.
     * @param {Object} data - Probe's data
     */
    DashboardChart.prototype._getPathList = function(data){
        var results = [];
        var current = [];
        for(var d in data){
            if(data[d].start && current.length){
                results.push(current);
                current = [];
            }
            current.push(data[d]);
        }
        results.push(current);
        return results;
    };

    /**
     * Add an area graph to the chart
     * @param {String} probe - probe name
     * @param {Object} data  - data
     * @param {String} color - color code
     * @param {d3Scale} y    - focus scale
     * @param {d3Scale} y2   - context scale
     */
    DashboardChart.prototype.addArea = function(probe,data,color,y,y2){
        if(!data.length)
            return;
        var separator = Config.separator();
        y = y || this.scales['default'].y;
        y2 = y2 || this.scales['default'].y2;
        var x = this.axis.x;
        var x2 = this.axis.x2;

        var reverse = (y(2) > y(1));
        var clippath = 'url(#clip_'+this.id+')';
        if(this.opposate)
            clippath = (reverse) ? 'url(#clip_bottom_'+this.id+')':'url(#clip_top_'+this.id+')';

        // Fill the container
        var g = this.container.focus.insert('g',':first-child')
            .attr('clip-path', clippath)
            .attr('class','chart ordered focus_'+probe)
            .attr('id','chart_'+probe.split(separator).join('_'));

        var g2 = this.container.context.insert('g',':first-child')
            .attr('class','chart context_'+probe);

        var paths = this._getPathList(data);

        //line used by predict path also so mandatory on each chart
        d3.svg.line()
            .x(function(d){ 
                return x(d.x);
            }).y(function(d){
                return y(d.y);
            });

        // Create the area generator for the main graph...
        var area = d3.svg.area()
            .x(function (d) { return x(d.x); })
            .y0(function(d){ 
                return y(d.y0) || this.conf.chartHeight;
            }.bind(this))
            .y1(function (d) { 
                return y((d.y0 || 0) + d.y);
            });

        // ... and for the tracker
        var area2 = d3.svg.area()
            .x(function (d) { return x2(d.x); })
            .y0(function(d){ return y2(d.y0) || this.conf.chartHeight; }.bind(this))
            .y1(function (d) { return y2(d.y0 + d.y); });

        var path = g.selectAll('path').data(paths).enter();
        path.append('path')
            .datum(function(d){ return d;})
            .attr('data-id',probe)
            .attr('stroke', color)
            .attr('fill', color)
            .attr('fill-opacity', 0.4)
            .attr('d', area)
            .attr('class','main');

        var path2 = g2.selectAll('path').data(paths).enter();
        path2.append('path')
            .datum(function(d){ return d;})
            .attr('data-id',probe)
            .attr('stroke', color)
            .attr('fill', color)
            .attr('fill-opacity', 0.4)
            .attr('d', area2);

        var dots = this.container.focus.append('g')
            .attr('clip-path', clippath)
            .attr('class','chart dots focus_'+probe)
            .attr('id','dots_'+probe.split(separator).join('_'));

        dots.selectAll('.dots')
            .data(data)
            .enter().append('circle')
            .attr('class','dots')
            .attr('cx',function(d){ return x(d.x);})
            .attr('cy',function(d){ return y(d.y0 + d.y);})
            .attr('r',3)
            .attr('fill',color)
            .attr('stroke','black')
            .attr('data-title', probe)
            .attr('data-date', function(d){ return d.x.toLocaleString(); })
            .attr('data-value',function(d){ 
                return this.units.unitFormat(d.y, this.units.get(this.scales[this.probes[probe].scale].unit));
            }.bind(this));

        this.content[probe] = {
            redraw: function(redrawData) {
                if(redrawData) {
                    var d = dots.selectAll('.dots').data(redrawData);
                    d.exit().remove();
                    d.enter().append('circle')
                        .attr('class','dots')
                        .attr('r',3)
                        .attr('fill',color)
                        .attr('stroke','black');
                    d.attr('cy',function(dot){ return y(dot.y0 + dot.y);})
                        .attr('cx',function(dot){ return x(dot.x);})
                        .attr('data-title', probe)
                        .attr('data-date', function(dot){ return dot.x.toLocaleString(); })
                        .attr('data-value',function(dot){ 
                            return this.units.unitFormat(dot.y, this.units.get(this.scales[this.probes[probe].scale].unit));
                        }.bind(this));

                    var p = g.selectAll('path.main').data(this._getPathList(redrawData));
                    p.enter().append('path')
                        .datum(function(dot){ return dot;})
                        .attr('data-id',probe)
                        .attr('stroke', color)
                        .attr('class','main')
                        .attr('fill', color)
                        .attr('fill-opacity', 0.4);
                    p.exit().remove();
                    p.attr('d',area);

                    //redraw predicted charts if any
                    if(this.predictData[probe])
                        this.addPredict(this.predictData[probe],color,redrawData,y,probe);
                }
                else {
                    g.selectAll('path.main').attr('d', area);
                    dots.selectAll('.dots')
                        .attr('cx',function(dot){ return x(dot.x);});

                    dots.selectAll('.predictDot')
                        .attr('cx',function(dot){ return x(dot.x);});
                    g.selectAll('path.predict').attr('d', d3.svg.line()
                                                     .x(function(dot){ return x(dot.x); })
                                                     .y(function(dot){ return y((dot.y0 || 0) + dot.y); }));
                    g.selectAll('path.mean').attr('d', d3.svg.line()
                                                  .x(function(dot){ return x(dot.x); })
                                                  .y(function(dot){ return y((dot.y0 || 0) + dot.y); }));

                }
            }.bind(this)
        };
    };

    /**
     * Add a line graph to the chart
     * @param {String} probe - probe name
     * @param {Object} data  - data
     * @param {String} color - color code
     * @param {d3Scale} y    - focus scale
     * @param {d3Scale} y2   - context scale
     */
    DashboardChart.prototype.addLine = function(probe,data,color,y, y2){
        if(!data.length)
            return;
        y = y || this.scales['default'].y;
        y2 = y2 || this.scales['default'].y2;
        var x = this.axis.x;
        var x2 = this.axis.x2;
        var separator = Config.separator();

        var reverse = (y(2) > y(1));
        var clippath = 'url(#clip_'+this.id+')';
        if(this.opposate)
            clippath = (reverse) ? 'url(#clip_bottom_'+this.id+')':'url(#clip_top_'+this.id+')';

        var g = this.container.focus.insert('g',':first-child')
            .attr('clip-path', clippath)
            .attr('class','chart ordered line focus_'+probe)
            .attr('id','chart_'+probe.split(separator).join('_'));

        var g2 = this.container.context.insert('g',':first-child')
            .attr('class','chart line context_'+probe);

        var dots = this.container.focus.append('g')
            .attr('clip-path', clippath)
            .attr('class','chart dots focus_'+probe)
            .attr('id','dots_'+probe.split(separator).join('_'));

        var paths = this._getPathList(data);

        // Create the area generator for the main graph...
        var line = d3.svg.line()
            .x(function (d) { return x(d.x); })
            .y(function (d) { return y(d.y); });

        // ... and for the tracker
        var line2 = d3.svg.line()
            //.interpolate("monotone")
            .x(function (d) { return x2(d.x); })
            .y(function (d) { return y2(d.y); });

        // Fill the container
        var path = g.selectAll('path').data(paths).enter();
        path.append('path')
            .datum(function(d){ return d;})
            .attr('data-id',probe)
            .attr('stroke', color)
            .attr('fill','none')
            .attr('d', line)
            .attr('class','main');

        // Display all the data into the overview
        var path2 = g2.selectAll('path').data(paths).enter();
        path2.append('path')
            .datum(function(d){ return d;})
            .attr('data-id',probe)
            .attr('stroke', color)
            .attr('fill','none')
            .attr('d', line2);

        // TODO: This is WAY too similar to the end of addArea; refactoring needed
        dots.selectAll('.dots')
            .data(data)
            .enter().append('circle')
            .attr('class','dots')
            .attr('cx',function(d){ return x(d.x);})
            .attr('cy',function(d){ return y(d.y0 + d.y);})
            .attr('r',3)
            .attr('fill',color)
            .attr('stroke','black')
            .attr('data-title', probe)
            .attr('data-date', function(d){ return d.x.toLocaleString(); })
            .attr('data-value',function(d){ 
                return this.units.unitFormat(d.y, this.units.get(this.scales[this.probes[probe].scale].unit));
            }.bind(this));

        this.content[probe] = {
            redraw: function(redrawData){
                if(redrawData){
                    var d = dots.selectAll('.dots').data(redrawData);
                    d.exit().remove();
                    d.enter().append('circle')
                        .attr('class','dots')
                        .attr('r',3)
                        .attr('fill',color)
                        .attr('stroke','black');
                    d.attr('cy',function(dot){ return y(dot.y0 + dot.y);})
                        .attr('cx',function(dot){ return x(dot.x);})
                        .attr('data-title', probe)
                        .attr('data-date', function(dot){ return dot.x.toLocaleString(); })
                        .attr('data-value',function(dot){ 
                            return this.units.unitFormat(dot.y, this.units.get(this.scales[this.probes[probe].scale].unit)); 
                        }.bind(this));

                    var p = g.selectAll('path.main').data(this._getPathList(redrawData));
                    p.enter().append('path')
                        .datum(function(dot){ return dot;})
                        .attr('data-id',probe)
                        .attr('class','main')
                        .attr('stroke', color)
                        .attr('fill','none');
                    p.exit().remove();
                    p.attr('d',line);

                    //redraw predicted charts if any
                    if(this.predictData[probe])
                        this.addPredict(this.predictData[probe],color,redrawData,y,probe);

                } 
                else {
                    g.selectAll('path.main').attr('d', line);
                    dots.selectAll('.dots')
                        .attr('cx',function(dot){ return x(dot.x);});

                    dots.selectAll('.predictDot')
                        .attr('cx',function(dot){ return x(dot.x);});
                    g.selectAll('path.predict').attr('d', d3.svg.line()
                                                     .x(function(dot){ return x(dot.x); })
                                                     .y(function(dot){ return y((dot.y0 || 0) + dot.y); }));
                    g.selectAll('path.mean').attr('d', d3.svg.line()
                                                           .x(function(dot){ return x(dot.x); })
                                                           .y(function(dot){ return y((dot.y0 || 0) + dot.y); }));

                }
            }.bind(this)
        };
    };

    /**
     * Add predicted data
     * @param {Object} predict - list of predicted data
     * @param {String} color   - path color
     * @param {Object} data    - Main path data
     * @param {d3Scale} y      - The y axis scale object
     * @param {String} probe   - Probe's name
     */
    DashboardChart.prototype.addPredict = function(predict,color,data,y,probe){
        if(!predict && !this.predictData[probe]) return;
        if(!predict) predict = this.predictData[probe].concat();
        else this.predictData[probe] = predict.concat();

        if(!predict[0].length) return;

        var separator = Config.separator();
        var x= this.axis.x;
        var g = this.container.focus.select('#chart_'+probe.split(separator).join('_'));
        var gDots = this.container.focus.select('#dots_'+probe.split(separator).join('_'));

        //link with the last available value
        var len = data.length;
        if(len){
            len--;
            for(var p in predict)
                predict[p] = [{'x': data[len].x.getTime() ,'y': data[len].y,'y0': data[len].y0}].concat(predict[p]);
        }

        //set areas
        var areas = [];
        /* predict data follow this pattern
           0: lower 95 dots
           1: lower 80 dots
           2: mean
           3: upper 80 dots
           4: upper 95 dots
        */

        var red = parseInt(color.substr(1,2),16);
        var green = parseInt(color.substr(3,2),16);
        var blue = parseInt(color.substr(5,2), 16);

        //lower 80
        areas.push({
            'area': predict[0].concat(predict[1].concat().reverse()),
            'color': 'rgb('.concat(
                Math.round(red * 0.6),',',
                Math.round(green * 0.6),',',
                Math.round(blue * 0.6),')'
            ),
            'type': 'lower 80'
        });
        //lower 95
        areas.push({
            'area': predict[0].concat(predict[2].concat().reverse()),
            'color': 'rgb('.concat(
                Math.round(red * 0.8),',',
                Math.round(green * 0.8),',',
                Math.round(blue * 0.8),')'
            ),
            'type': 'lower 95'
        });
        //upper 80
        areas.push({
            'area': predict[4].concat(predict[3].concat().reverse()),
            'color': 'rgb('.concat(
                Math.min(Math.round(red * 0.6),255),',',
                Math.min(Math.round(green * 0.6),255),',',
                Math.min(Math.round(blue * 0.6),255),')'
            ),
            'type': 'upper 80'
        });
        //upper 95
        areas.push({
            'area': predict[2].concat(predict[4].concat().reverse()),
            'color': 'rgb('.concat(
                Math.min(Math.round(red * 0.8),255),',',
                Math.min(Math.round(green * 0.8),255),',',
                Math.min(Math.round(blue * 0.8),255),')'
            ),
            'type': 'upper 95'
        });

        //line used by predict path also so mandatory on each chart
        var line = d3.svg.line()
            .x(function(d){ return x(d.x); })
            .y(function(d){ return y((d.y0 || 0) + d.y); });

        var path = g.selectAll('path.predict').data(areas);
        path.exit().remove();
        path.enter().append('path')
            //.attr('stroke',function(d){ return d.color;})
            .attr('fill',function(d){ return d.color;})
            .attr('fill-opacity',0.7)
            .attr('class','predict');
        path.datum(function(d){ return d.area;})
            .attr('d',function(d) { return line(d) + 'Z'; });

        path = g.select('path.mean');
        if(path.empty()) path = g.append('path').attr('stroke',color).attr('class','mean').attr('fill','none');
        path.datum(predict[2]).attr('d',line);

        //dots
        var dots = gDots.selectAll('circle.predictDot').data(predict[2]);
        dots.exit().remove();
        dots.enter().append('circle')
            .attr('class','predictDot')
            .attr('fill',color)
            .attr('stroke','black')
            .attr('r',3)
            .attr('z-index','1');
        dots.attr('cx',function(d){ return x(d.x); })
            .attr('cy',function(d){ return y((d.y0 || 0) + d.y); })
            .attr('data-title', probe)
            .attr('data-date', function(d){ return new Date(d.x).toLocaleString(); })
            .attr('data-value',function(d){ 
                return this.units.unitFormat(d.y, this.units.get(this.scales[this.probes[probe].scale].unit));
            }.bind(this));
    };

    /**
     * add a column graph to the chart
     * @param {String} probe - probe name
     * @param {Object} data  - data
     * @param {String} color - color code
     * @param {d3Scale} y    - focus scale
     * @param {d3Scale} y2   - context scale
     */
    DashboardChart.prototype.addColumn = function(probe,data,color,y,y2){
        if(!data.length)
            return;
        var x = this.axis.x;
        y = y || this.scales['default'].y;
        y2 = y2 || this.scales['default'].y2;

        //line used by predict path also so mandatory on each chart
        d3.svg.line()
            .x(function(d){ return x(d.x); })
            .y(function(d){ return y(d.y); });

        var reverse = (y(2) > y(1));
        var clippath = 'url(#clip_' + this.id + ')';
        if(this.opposate)
            clippath = (reverse) ? 'url(#clip_bottom_' + this.id + ')':'url(#clip_top_' + this.id + ')';

        var getInterval = function(input) {
            var result = Number.MAX_VALUE;
            for(var i = 0, len = input.length;i<len - 1;i++) {
                if((!i || input[i].start === false) && input[i+1].start === false) {
                    if(input[i+1].x - input[i].x < result)
                        result = input[i+1].x - input[i].x;
                }
            }
            return result;
        };

        var interval = getInterval(data);
        var colwidth = this.axis.x(interval) - this.axis.x(0);
        var col2width = this.axis.x2(interval) - this.axis.x2(0);
        var separator = Config.separator();

        var focusGroup = this.container.focus.insert('g',':first-child')
            .attr('class','columns ordered')
            .attr('clip-path',clippath)
            .attr('id','chart_'+probe.split(separator).join('_'));
        var contextGroup = this.container.context.insert('g',':first-child')
            .attr('class','columns')
            .attr('clip-path','url(#clip_'+this.id+')');
        var dots = this.container.focus.append('g')
            .attr('class','chart dots focus_'+probe)
            .attr('clip-path',clippath)
            .attr('id','dots_'+probe.split(separator).join('_'));

        dots.selectAll('.dots')
            .data(data)
            .enter().append('circle')
            .attr('class','dots')
            .attr('cx',function(d){ return x(d.x);})
            .attr('cy',function(d){
                d.y0 = d.y0 || 0;
                return y(d.y0 + d.y);
            })
            .attr('r',3)
            .attr('fill',color)
            .attr('stroke','black')
            .attr('data-title', probe)
            .attr('data-date', function(d){ return d.x.toLocaleString(); })
            .attr('data-value',function(d){ 
                return this.units.unitFormat(d.y, this.units.get(this.scales[this.probes[probe].scale].unit));
            }.bind(this));

        var bars = focusGroup.selectAll('.bar').data(data).enter();
        var bars2 = contextGroup.selectAll('.bar').data(data).enter();

        var getY = function(d){
            var top = y(d.y0 + d.y);
            var size = y(d.y0) - top;
            if(size <0)
                top = y(d.y0);
            return top;
        };
        var getHeight = function(d){
            var top = y(d.y0 + d.y);
            var size = y(d.y0) - top;
            if(size <0)
                size *= -1;
            return size;
        };

        var getContextY = function(d){
            var top = y2(d.y0 + d.y);
            var size = y2(d.y0) - top;
            if(size <0)
                top = y2(d.y0);
            return top;
        };
        var getContextHeight = function(d){
            var top = y2(d.y0 + d.y);
            var size = y2(d.y0) - top;
            if(size <0)
                size *= -1;
            return size;
        };

        bars.append('rect')
            .attr('x', function(d){ return this.axis.x(d.x) - colwidth/2; }.bind(this))
            .attr('y', getY)
            .attr('width', colwidth)
            .attr('height', getHeight)
            .attr('stroke', color)
            .attr('fill', color)
            .attr('fill-opacity', 0.4);

        bars2.append('rect')
            .attr('x', function(d){ return this.axis.x2(d.x) - col2width/2; }.bind(this))
            .attr('y', getContextY)
            .attr('width', col2width)
            .attr('height', getContextHeight)
            .attr('stroke', color)
            .attr('fill', color)
            .attr('fill-opacity', 0.4);

        this.content[probe] = {
            redraw: function(redrawData) {
                if(redrawData){
                    interval = getInterval(redrawData);
                    colwidth = this.axis.x(interval) - this.axis.x(0);

                    var r = focusGroup.selectAll('rect').data(redrawData);
                    r.exit().remove();
                    r.enter().append('rect')
                        .attr('stroke', color)
                        .attr('fill', color)
                        .attr('fill-opacity', 0.4)
                        .append('title').text(function(dot){ return probe + ' : ' + dot.y; });
                    r.attr('x', function(dot){ return this.axis.x(dot.x) - colwidth/2; }.bind(this))
                        .attr('y', getY)
                        .attr('width', colwidth)
                        .attr('height', getHeight);

                    var d = dots.selectAll('.dots').data(redrawData);
                    d.exit().remove();
                    d.enter().append('circle')
                        .attr('class','dots')
                        .attr('r',3)
                        .attr('fill',color)
                        .attr('stroke','black');
                    d.attr('cx',function(dot){ return x(dot.x);})
                        .attr('cy',function(dot){ return y(dot.y0 + dot.y);})
                        .attr('data-title', probe)
                        .attr('data-date', function(dot){ return dot.x.toLocaleString(); })
                        .attr('data-value',function(dot){ 
                            return this.units.unitFormat(dot.y, this.units.get(this.scales[this.probes[probe].scale].unit)); 
                        }.bind(this));

                    //redraw predicted charts if any
                    if(this.predictData[probe])
                        this.addPredict(this.predictData[probe], color, redrawData, y, probe);
                }
                else {
                    colwidth = this.axis.x(interval) - this.axis.x(0);
                    focusGroup.selectAll('rect')
                        .attr('x', function(dot){ return this.axis.x(dot.x) - colwidth / 2;}.bind(this))
                        .attr('width', colwidth);
                    dots.selectAll('.dots')
                        .attr('cx',function(dot){ return x(dot.x);});

                    focusGroup.selectAll('path.predict').attr('d', d3.svg.line()
                                                              .x(function(dot){ return x(dot.x); })
                                                              .y(function(dot){ return y((dot.y0 || 0) + dot.y); }));
                    focusGroup.selectAll('path.mean').attr('d', d3.svg.line()
                                                              .x(function(dot){ return x(dot.x); })
                                                              .y(function(dot){ return y((dot.y0 || 0) + dot.y); }));

                    dots.selectAll('.predictDot')
                        .attr('cx',function(dot){ return x(dot.x);});
                }
            }.bind(this)
        };
    };

    /**
     * Remove the given probe
     * @param {String} Probe's name
     */
    DashboardChart.prototype.removeProbe = function(probe){
        if(this.probes[probe]){
            this.legendManager.removeLegend(probe);
            var scaleName = this.probes[probe].scale;
            var scale = this.scales[scaleName];
            var direction = (scale.reversed) ? 'opposate': 'top';
            var orient = scale.orient;
            delete this.legends[probe];
            delete this.probes[probe];
            delete this.data[probe];
            //TODO add removeScale method
            scale.boundedProbe--;
            scale = (scale.boundedProbe) ? false : scale.name;
            delete this.scales[scale];
            if(this.current[orient][direction] === scaleName)
                this.switchScale(orient,direction);

            //check if we no longer need to be in opposate mode
            if(this.opposate && !this.current['left']['opposate'] && !this.current['right']['opposate']){
                this.opposate = false;
                var height = this.conf.chartHeight - 22;
                var trackHeight = this.conf.trackHeight;
                for(var s in this.scales){
                    this.scales[s].height = height;
                    this.scales[s].trackHeight = trackHeight;
                }

                var axis = this.container.focus.select('.y.axis.reversed')[0][0];
                while(axis.firstChild) axis.removeChild(axis.firstChild);

                axis = this.container.focus.select('.y.axis.right.reversed')[0][0];
                while(axis.firstChild) axis.removeChild(axis.firstChild);

            }
            DashboardProbes.remove(this.id,probe,scale);
            this.redraw();
        }
    };

    /**
     * Build the metrics selector form
     * @param {String} name           - Form's name
     * @return {DOMElement} container - THe select element
     */
    DashboardChart.prototype.buildMetricForm = function(name){
        var container = jQuery('<p style="margin: 0.5em 0;"><label>Probe :</label></p>');
        var metrics = DashboardProbes.getMetrics();
        if(metrics)
            this.appendMetricSelect(metrics, container, name);
        else{
            this.toogleSpinner(container);
            container.find('.spinner').attr('style','position: initial;vertical-align: middle;margin-left: 1em;');
            var check = function(){
                var allMetrics = DashboardProbes.getMetrics();
                if(!allMetrics)
                    setTimeout(check,1000/60); //TODO : Find a better way to wait for the metrics to be ready
                else
                    this.appendMetricSelect(allMetrics,container,name);
            }.bind(this);
            setTimeout(check,1000/60);
        }
        return container;
    };

    /**
     * Add a new metric's select and set the eventListener
     * @param {Object} metrics       - Metrics list
     * @param {DOMElement} container - The container to append select element
     * @param {String} name          - Form's name
     */
    DashboardChart.prototype.appendMetricSelect = function(metrics, container, name){
        if(container.find('.spinner'))
            container.find('.spinner').remove();
        var select = jQuery('<select name="'+name+'" class="formButton select" ></select>');

        // Get all the metric names
        var names = Object.keys(metrics);
        // Order the names alphabetically
        names = names.sort(function(a, b) {
            return a.localeCompare(b, {
                sensitivity: 'base'
            });
        });

        for(var i in names) {
            var option = jQuery('<option value="' + names[i] + '">' + names[i] + '</option>');
            select.append(option);
        }

        select[0].addEventListener('change',function(event){
            this.cleanMetricsSelect(event.target);
            var target = metrics[event.target.value];
            if(typeof(target) === 'object')
                this.appendMetricSelect(target,container,name);
        }.bind(this));

        container.append(select);
        if(Object.keys(metrics).length){
            var target = metrics[Object.keys(metrics)[0]];
            if(typeof(target) === 'object')
                this.appendMetricSelect(target,container,name);

            /*
              Removed until we handle host.*.RAM requests type
              if(container.children().length === 1)
                select.append($('<option value="">Select host</option>'));
              else
                select.append($('<option value="*">All(*)</option>'));
            */
        }
        else {
            select.append('<option value="">None available</option>');
        }
    };

    /**
     * Clean all old metrics select.
     * @param {DOMSelectElement} select - The select element from which we want to cleanup
     */
    DashboardChart.prototype.cleanMetricsSelect = function(select){
        while(select.nextElementSibling) select.parentNode.removeChild(select.nextElementSibling);
    };

    /**
     * Return or create if not exist the scale
     * @param {String} unit - Unit's reference
     * @param {String} orient - Scale's orientation (left|right)
     * @param {Boolean} reversed - Scale's direction
     */
    DashboardChart.prototype.getScale = function(unit,orient,reversed){
        if(!unit) return false;
        orient = orient || 'left';
        reversed = reversed || false;
        var result = false;
        for(var s in this.scales){
            var scale = this.scales[s];
            if(scale.unit !== unit) continue;
            if(scale.orient !== orient) continue;
            if(String(scale.reversed) !== reversed) continue;
            result = s;
            break;
        }
        if(!result){
            result = unit;
            if(orient === 'right') result += '-right';
            if(String(reversed) === 'true') result += '-reversed';
            this.saveScale(result,unit,orient,String(reversed));
            this.addScale(result,{
                'unit': unit,
                'orient': orient,
                'reversed': String(reversed),
            });
        }
        return result;
    };

    /**
     * Remove deleted scales and unused axis
     */
    DashboardChart.prototype.cleanScales = function(){
         //clean and update current scale
        for(var o in this.current)
            for(var d in this.current[o])
                if(!this.scales[this.current[o][d]]) this.switchScale(o,d);

        var axis;

        //check if we no longer need to be in right mode
        if(!this.current['right']['top'] && !this.current['right']['opposate']){
            axis = this.container.focus.select('.y.axis.right.reversed')[0][0];
            while(axis.firstChild) axis.removeChild(axis.firstChild);

            axis = this.container.focus.select('.y.axis.right')[0][0];
            while(axis.firstChild) axis.removeChild(axis.firstChild);
        }

        //check if we no longer need to be in opposate mode
        if(this.opposate && !this.current['left']['opposate'] && !this.current['right']['opposate']){
            this.opposate = false;
            var height = this.conf.chartHeight - 22;
            var trackHeight = this.conf.trackHeight;
            for(var s in this.scales){
                this.scales[s].height = height;
                this.scales[s].trackHeight = trackHeight;
            }

            axis = this.container.focus.select('.y.axis.reversed')[0][0];
            while(axis.firstChild) axis.removeChild(axis.firstChild);

            axis = this.container.focus.select('.y.axis.right.reversed')[0][0];
            while(axis.firstChild) axis.removeChild(axis.firstChild);

        }

        //check left axis
        if(!this.current['left']['top'] && !this.current['left']['opposate']){
            axis = this.container.focus.select('.y.axis.reversed')[0][0];
            while(axis.firstChild) axis.removeChild(axis.firstChild);

            axis = this.container.focus.select('.y.axis')[0][0];
            while(axis.firstChild) axis.removeChild(axis.firstChild);
        }

        //TODO: We should add a method to updtate boundedProbe without redrawing
        this.buildScale();
        this.setDomain(this.data);
    };

    /** TODO: create a panel class */
    /**
     * Show or hide the panel
     * @param {Boolean} force - if set to true will force panelUp.
     */
    DashboardChart.prototype.tooglePanel = function(force){
        if(this.panelUp && !force){
            this.panelContainer[0].setAttribute('style','transform: translate('+this.conf.containerWidth+'px,0);'
                                                .concat('-moz-transform: translate('+this.conf.containerWidth+'px,0);')
                                                .concat('-webkit-transform: translate('+this.conf.containerWidth+'px,0);')
                                                .concat('-ms-transform: translate('+this.conf.containerWidth+'px,0);')
                                                .concat('-o-transform: translate('+this.conf.containerWidth+'px,0);'));
            this.flushPanel();
        }else{
            this.panelContainer[0].setAttribute('style','transform: translate(0,0);'
                                                .concat('-moz-transform: translate(0,0);')
                                                .concat('-webkit-transform: translate(0,0);')
                                                .concat('-ms-transform: translate(0,0);')
                                                .concat('-o-transform: translate(0,0);'));
        }
        this.panelUp = force || !this.panelUp;
    };

    /**
     * Show the logs panel
     * @param {Object} d - Logs data
     */
    DashboardChart.prototype.toogleLogsPanel = function(d){
        this.buildLogsPanel(d);
        this.tooglePanel(true);
    };

    /**
     * Show the dup panel
     */
    DashboardChart.prototype.toogleDupPanel = function(){
        this.buildDupPanel();
        this.tooglePanel(true);
    };


    /**
     * Show the edit chart panel
     */
    DashboardChart.prototype.toogleEditPanel = function(){
        this.buildEditPanel();
        this.tooglePanel(true);
    };

    /**
     * Show the add panel form
     */
    DashboardChart.prototype.toogleAddPanel = function(){
        this.buildAddPanel();
        this.tooglePanel(true);
    };

    /**
     * Construct duplicate panel
     */
    DashboardChart.prototype.buildDupPanel = function(){
        var container = jQuery('<div class="dupPanel"></div>');
        var title = jQuery('<h3>Copy widget</h3>');
        var submit = jQuery('<button id="dup_submit">copy</button>');
        var replaceHosts = jQuery('<div><label>Replace hosts</label></div>');
        var hosts = {};
        var metrics = DashboardProbes.getMetrics();
        var currentConf = DashboardManager.currentParts[this.id];
        var conf = {
            'mode': currentConf.conf.mode,
            'probes': JSON.parse(JSON.stringify(currentConf.conf.probes)),
            'scales': currentConf.conf.scales
        };
        var h;

        //list used hosts
        for(var p in currentConf.conf.probes){
            h = DashboardProbes.extractHost(p);
            if(!hosts[h]) hosts[h] = h;
        }

        //Create select host element
        var hostSelect = jQuery('<select></select>');
        for(h in metrics){
            hostSelect.append(jQuery('<option value="'+h+'">'+h+'</option>'));
        }

        //build replace host part
        for(h in hosts){
            var clone = hostSelect.clone(true);
            clone.attr('name',h);
            for(var s in clone[0].options){
                if(clone[0].options[s].value === h){
                    clone[0].selectedIndex = clone[0].options[s].index;
                    break;
                }
            }
            clone.on('change',function(e){
                var host = e.target.getAttribute('name');
                hosts[host] = e.target.options[e.target.selectedIndex].value;
            });
            p = jQuery('<p>');
            p.append(jQuery('<span>'+h+'</span>')).append(clone);
            replaceHosts.append(p);
        }

        //Submit action
        submit.click(function(){
            //replace hosts
            var tmp = {};
            for(var hostname in hosts) {
                for(var probename in conf.probes) {
                    var j = DashboardProbes.extractHost(probename);
                    if( j === hostname) {
                        var i = probename.replace(j, '');
                        tmp[hosts[hostname].concat(i)] = conf.probes[probename];
                    }
                }
            }

            //set new widget partData
            var partData = {
                'height': currentConf.height,
                'width': currentConf.width,
                'widget': currentConf.widget,
                'title': 'Chart',
                'conf': {
                    'probes': tmp,
                    'scales': conf.scales,
                    'mode': conf.mode
                }
            };

            //keep timing configuration for the new widget
            if(currentConf.conf.fromdate) partData.conf.fromdate = currentConf.conf.fromdate;
            if(currentConf.conf.untildate) partData.conf.untildate = currentConf.conf.untildate;

            //Finally create it
            Widget.getWidgetById(currentConf.widget, function(widget) {
                if(widget) {
                    DashboardManager.addWidget(partData, widget);
                }
            });
        });

        //Construct and apply DOM tree
        container.append(title);
        container.append(replaceHosts);
        container.append(submit);
        this.appendToPanel(container);
    };

    /**
     * Construct log panel
     * @param {Object} data - Logs data
     */
    DashboardChart.prototype.buildLogsPanel = function(data){
        var container = jQuery('<div class="logPanel"></div>');

        var logContainer = jQuery('<p class="logContainer legend"></p>');
        logContainer.append('<span class="date">Date</span>');
        logContainer.append('<span class="host">Host</span>');
        logContainer.append('<span class="service">Service</span>');
        logContainer.append('<span class="type">Type</span>');
        logContainer.append('<span class="output">Output</span>');
        container.append(logContainer);

        for(var i = 0, len = data.logs.length;i<len;i++) {
            var log = data.logs[i];
            var date = new Date(log['time']);

            logContainer = jQuery('<p class="logContainer log '+((log['state'] > 1)? 'error':'warning')+'"></p>');
            logContainer.append('<span class="date">'+(date.toLocaleDateString().concat(' ',date.toLocaleTimeString()))+'</span>');
            logContainer.append('<span class="host">'+log['host_name']+'</span>');
            logContainer.append('<span class="service">'+(log['sertvice_description'] || '')+'</span>');
            logContainer.append('<span class="type">'+log['type']+'</span>');
            logContainer.append('<span class="output">'+log['plugin_output']+'</span>');
            container.append(logContainer);
        }

        this.appendToPanel(container);
    };

    /**
     * Construct add panel
     */
    DashboardChart.prototype.buildAddPanel = function(){
        var id = this.id;
        var probes = this.probes;
        var units = this.units.units;
        var container = jQuery('<div class="addprobe"></div>');

        //choose an unused color by default
        var getNextUnusedColor = function(){
            var colors = form.getColorsList();
            var used = [];
            for(var p in probes){
                var c = probes[p].color;
                if(used.indexOf(c) === -1)
                    used.push(c);
            }
            for(var i =0, len = colors.length; i<len; i++){
                if(used.indexOf(colors[i]) === -1)
                    break;
            }
            return colors[i];
        };

        var nextColor = getNextUnusedColor();

        //containers
        var addForm = jQuery('<form name="add_chart_form_' + id + '" ></form>');
        addForm.append(jQuery('<h3>Add probe</h3>'));
        var probeSelection = jQuery('<div class="column"></div>');
        var probePosition = jQuery('<div class="column"></div>');
        var settings = jQuery('<div class="column"></div>');

        //probe
        probeSelection.append(this.buildMetricForm('server'));

        //scale selection
        probePosition.append('<label>Scale position :</label>');
        probePosition.append(form.orientAddSelect());
        probePosition.append(form.directionAddSelect());
        probePosition.append('<label>Scale unit :</label>');
        probePosition.append(form.unitSelect(false, false, units));

        //add unit
        if(Config.isAdmin()) {
            var add = jQuery('<p><button class="add">Add unit</button></p>');
            add.on('click',function(evt) {
                evt.preventDefault();
                var target = evt.target.getBoundingClientRect();
                var currentUnits = this.units;

                jQuery.ajax('/units/add').success(function(addResult){
                    var newForm = jQuery(addResult);
                    var popin = jQuery('<div class="popin" style="top:' + (target.top - 200) + 'px;left:' + target.left + 'px;"></div>');
                    var close = jQuery('<button class="close" title="close"></button>');
                    close.on('click',function(){ popin.remove(); });
                    var title = jQuery('<h3>Add unit</h3>');
                    popin.append(close);
                    popin.append(title);

                    newForm.find('.submit').on('click',function(clickEvt){
                        clickEvt.preventDefault();

                        jQuery.ajax('/units/add',{
                            'type':'POST',
                            'data': {
                                'name': document.forms.add_unit.name.value,
                                'symbol': document.forms.add_unit.symbol.value,
                                'factor': document.forms.add_unit.factor.value
                            }
                        }).success(function(u){
                            currentUnits.add(u.name, u);
                            var option = document.createElement('option');
                            option.setAttribute('value',u.name);
                            option.setAttribute('selected','selected');
                            option.appendChild(document.createTextNode(u.name));

                            document.forms['add_chart_form_'+id].unit.appendChild(option);
                            popin.remove();
                        }.bind({'units': currentUnits})).error(function(addError) { // TODO : Is the bind necessary ?
                            var response = addError.responseJSON;
                            var li = false;
                            popin.find('.errors').empty();
                            for(var label in response) {
                                li = popin.find('.errors.'+label);
                                for(var i = 0, len = response[label].length; i<len; i++)
                                    li.append('<li>'+response[label][i]+'</li>');
                            }
                        });

                        return false;
                    });

                    popin.append(newForm);
                    jQuery('body').append(popin);
                });
            }.bind(this));
            probePosition.append(add);
        }

        //chart type and color
        settings.append('<label>Chart type : </label>');
        settings.append(form.typeAddSelect());
        settings.append('<label>Chart color : </label>');
        settings.append(form.colorAddBox(nextColor));
        var subcontainer = jQuery('<div class="submit-container"></div>');
        var subandclose = jQuery('<button class="submit" data-tooltip="Add probes and close this panel">Add and close</button>');
        var submit = jQuery('<button class="submit" id="add_chart_submit" data-tooltip="Add a new chart to this widget">Add</button>');
        subcontainer.append(subandclose);
        subcontainer.append(submit);

        addForm.append(probeSelection);
        addForm.append(probePosition);
        addForm.append(settings);
        addForm.append(subcontainer);

        submit.click(function(e){
            e.preventDefault();
            var data = {
                'id': this.id,
                'conf':{
                    'probes':{},
                }
            };

            var clickedForm = document['add_chart_form_' + this.id];

            var color= clickedForm.color.value;
            var type= clickedForm.type.value;

            //scale
            var unit = clickedForm.unit.value;
            var orient= clickedForm.orient.value;
            var direction= clickedForm.reversed.value;
            var scale= this.getScale(unit, orient, direction, false);

            var query = '';
            var i, len;
            if(clickedForm[1].value === color)
                query = clickedForm.server.value;
            else{
                var separator = Config.separator();
                for(i = 0, len = clickedForm['server'].length; i < len; i++) {
                    if(i) query += separator;
                    query += clickedForm[i].value;
                }
            }

            //TODO: add some tooltips or an enabled/disabled state
            if(!query) return false;
            //var probeList = DashboardProbes.getProbeList(query);
            var probeList = [query];

            var addCount = 0;
            for(i in probeList) {
                if(!this.probes[i]) {
                    addCount++;
                }
            }

            if(addCount > 10) {
                var warned = subcontainer.data('warned');
                if(!warned) {
                    subcontainer.data('warned', 1);
                    subcontainer.prepend(jQuery('<div class="submit-warning">You are going to add ' + addCount + ' probes, are you sure? (re-click to confirm)<p>Adding too many probes at the same time can take some times and freez your browser!</p></div>'));
                    return false;
                } 
                else {
                    subcontainer.data('warned',false);
                    subcontainer.children()[0].remove();
                }
            }

            for(i in probeList) {
                var name = probeList[i];
                var order = ++this.counter;

                if(this.probes[name]) continue;
                if(i)
                    color = getNextUnusedColor();

                data.conf.probes[name] = {
                    'color': color,
                    'type': type,
                    'order': order,
                    'scale': scale,
                    'stacked': false
                };

                //save the new conf localy to avoid an other getConf request
                this.probes[name] = data.conf.probes[name];
                DashboardProbes.addProbe(name);
                this.legends[name] = this.legendManager.addLegend({
                    'name': name,
                    'color': this.probes[name].color
                });
                //draw the legend and resize the box
                var setLegend = function() {
                    var check = this.legendManager.redraw();
                    if(!check) {
                        setTimeout(setLegend.bind(this),1000);
                        return;
                    }
                    if(this.legendManager.getCurrentHeight() > 42)
                        this.updateBoxSize();
                };
                setLegend.call(this);
            }
            if(!addCount) return false;
            data.conf = JSON.stringify(data.conf);

            //show the spinner if needed
            this.toogleSpinner(this.container.main);

            DashboardManager.savePartData(data,function(){
                DashboardProbes.worker.postMessage([3,{
                    'probes': probeList,
                    'start' : (this.conf.fromDate) ? this.conf.fromDate.getTime() : false
                },this.id]);
                clickedForm.color.value = getNextUnusedColor();
                settings.find('.color').find('.selected').attr('class','');
                settings.find('.color').find('[data-value="' + clickedForm.color.value + '"]').attr('class','selected');
            }.bind(this));

            return true;
        }.bind(this));

        subandclose.click(function(){
            var clickedForm = document['add_chart_form_'.concat(this.id)];
            var query = '';
            var i, len;
            if(clickedForm[1].value === clickedForm.color.value) {
                query = clickedForm.server.value;
            }
            else {
                for(i = 0, len = clickedForm['server'].length; i < len; i++){
                    if(i) 
                        query = query.concat(Config.separator());
                    query = query.concat(clickedForm[i].value);
                }
            }
            if(!query) return false;

            //var probeList = DashboardProbes.getProbeList(query);
            var probeList = [query];
            var addCount = 0;
            for(i in probeList){
                if(this.probes[name]) continue;
                addCount++;
            }

            if(addCount > 10){
                var warned = subcontainer.data('warned');
                if(!warned){
                    subcontainer.data('warned', 1);
                    subcontainer.prepend(jQuery('<div class="submit-warning">You are going to add ' + addCount + ' probes, are you sure? (re-click to confirm)<p>Adding too many probes at the same time can take some times and freez your browser.</p></div>'));
                    return false;
                }
            }
            submit.click();
            this.tooglePanel();
        }.bind(this));

        container.append(addForm);
        this.appendToPanel(container);
    };

    /**
     * Return probes by scales (every probe from the same scale can be stacked)
     */
    DashboardChart.prototype.getStackableGroups = function() {
        var results = {};
        var probes = this.probes;
        for(var p in probes){
            var scale = probes[p].scale;
            if(!results[scale])
                results[scale] = [];
            results[scale].push(p);
        }
        return results;
    };

    /**
     * Construct the edit panel
     */
    DashboardChart.prototype.buildEditPanel = function() {
        var probes = this.probes;
        var units = this.units.units;
        var scales = this.scales;
        var container = jQuery('<div class="editPanel"></div>');
        container.append(jQuery('<h3>Probes settings</h3>'));
        var groups = this.getStackableGroups();
        for(var g in groups){
            var groupContainer = jQuery('<p class="editGroup"></p>');
            groupContainer.append('<label style="vertical-align:middle;font-weight:bold;text-shadow: -2px 2px black;color:#57b4dc;">'+g+'</label>');
            if(groups[g].length > 1){
                var mode = probes[groups[g][0]].stacked;
                var stackButton = jQuery('<button data-group="'+g+'" style="float: right;margin-right:2em;" class="stack disabled formButton" data-tooltip="Stack/Unstack all probes from this scale.">'+ ((mode) ? 'Unstack all':'Stack all') +'</button>');
                stackButton.click(function(e){
                    e.preventDefault();
                    var gr = e.target.getAttribute('data-group');
                    var group = groups[gr];
                    var stacked = !this.probes[group[0]].stacked;
                    var query = {
                        'id': this.id,
                        'conf': {
                            'probes': {}
                        }
                    };
                    for(var i = 0, len = group.length;i<len;i++){
                        var probe = group[i];
                        if(this.probes[probe].stacked !== stacked){
                            this.probes[probe].stacked = stacked;
                            query.conf.probes[probe] = {'stacked': stacked};
                        }
                    }

                    query.conf = JSON.stringify(query.conf);
                    DashboardManager.savePartData(query);
                    this.buildScale();
                    this.setDomain(this.data);
                    this.redraw();

                    var context = this.axis.x2.domain();
                    var focus = this.axis.x.domain();
                    DashboardProbes.worker.postMessage([8,{
                        'probes': this.probes,
                        'contextTimeline': [context[0].getTime(),context[1].getTime()],
                        'focusTimeline': [focus[0].getTime(),focus[1].getTime()],
                        'mode': this.conf.mode
                    },this.id]);
                }.bind(this));

                groupContainer.append(stackButton);
            }
            container.append(groupContainer);

            var separator = Config.separator();
            for(var p = 0, len = groups[g].length; p<len; p++){
                var probe = probes[groups[g][p]];
                var scale = scales[probe.scale];
                var unit = scale.unit;

                var probeContainer = jQuery('<p class="editContent"></p>');
                probeContainer.append('<label style="display: table-cell;text-shadow: -2px 2px black;">' + 
                                      groups[g][p].split(separator).join('.') + 
                                      '</label>');
                probeContainer.append(form.colorBox.call(this,probe.color, groups[g][p]));
                probeContainer.append(form.orientSelect.call(this,scale.orient, groups[g][p]));
                probeContainer.append(form.directionSelect.call(this,scale.reversed, groups[g][p]));
                probeContainer.append(form.unitSelect.call(this,unit, groups[g][p], units));
                probeContainer.append(form.typeSelect.call(this,probe.type,probe.stacked, groups[g][p]));
                if(len > 1)
                    probeContainer.append(form.stackCheckbox.call(this,probe.stacked, groups[g][p]));
                probeContainer.append(form.removeButton.call(this,groups[g][p]));

                container.append(probeContainer);
            }
        }


        this.appendToPanel(container);
    };

    /**
     * Flush the panel of any content
     */
    DashboardChart.prototype.flushPanel = function(){
        this.panelContainer.empty();
        var close = jQuery('<button class="close" title="Close the panel"></button>');
        close.on('click',function(){this.tooglePanel();}.bind(this));
        this.panelContainer.append(close);
    };

    /**
     * Build the panel container
     */
    DashboardChart.prototype.buildPanel = function(){
        var container = jQuery('<div class="panel"></div>');
        var close = jQuery('<button class="close" title="Close the panel"></button>');
        close.on('click',function(){this.tooglePanel();}.bind(this));
        container.append(close);
        this.container.main.append(container);

        this.panelContainer = container;
        this.panelUp = true;
        this.tooglePanel();
    };

    /**
     * Append to panel
     * @param {DOMElement} stuff - Stuff to append.
     */
    DashboardChart.prototype.appendToPanel = function(stuff){
        this.flushPanel();
        this.panelContainer.append(stuff);
    };

    /**
     * Save a new scale.
     * @param {String} name      - Scale name
     * @param {String} unit      - Unit reference
     * @param {String} orient    - Orientation (left|right)
     * @param {Boolean} reversed - Direction
     */
    DashboardChart.prototype.saveScale = function(name,unit,orient,reversed){
        var data = {
            'orient': orient,
            'reversed': reversed,
            'unit': unit
        };
        var conf = {
            'id': this.id,
            'conf':{
                'scales':{}
            }
        };
        conf.conf.scales[name] = data;
        conf.conf = JSON.stringify(conf.conf);
        DashboardManager.savePartData(conf);
    };

    /**
     * Set start date
     * @param {Date} context - New fromDate timestamp
     */
    DashboardChart.prototype.updateFromDate = function(context){
        if(!context){
            this.conf.fromDate = false;
            return;
        }
        if(context < 0){
            this.conf.fromDate = new Date(new Date().getTime() + context);
            this.conf.untilDate = false;
        }else
            this.conf.fromDate = new Date(context);
        this.container.brush.clear();
        this.container.context.select('.x.brush').call(this.container.brush);
        this.toogleSpinner(this.container.main);

        var end = (this.conf.untilDate) ? this.conf.untilDate.getTime() : false;
        this.conf.brushstart = false;
        this.conf.brushend = false;

        DashboardProbes.worker.postMessage([7,{'probes': this.probes, 'start': this.conf.fromDate.getTime(), 'end': end },this.id]);
        DashboardManager.savePartData({
            'id': this.id,
            'conf': JSON.stringify({
                'fromdate': context,
                'untildate': end,
                'brushstart': false,
                'brushend': false
            })
        });
        //update globale timeline
        if(this.conf.fromDate)
            DashboardManager.timeline.update(this.conf.fromDate, this.conf.untilDate);
    };

    /**
     * Set until date
     * @param context {Number} - New untilDate timestamp
     */
    DashboardChart.prototype.updateUntilDate = function(context){
        if(!context){
            this.conf.untilDate = false;
            return;
        }
        this.conf.untilDate = new Date(context);
        this.container.brush.clear();
        this.container.context.select('.x.brush').call(this.container.brush);

        //clear brush
        this.conf.brushstart = false;
        this.conf.brushend = false;

        DashboardProbes.worker.postMessage([7,{'probes': this.probes, 'start': this.axis.x2.domain()[0].getTime(),'end': context},this.id]);
        DashboardManager.savePartData({
            'id': this.id,
            'conf': JSON.stringify({
                'untildate': context,
                'brushstart': false,
                'brushend': false
            })
        });
        //update globale timeline
        if(this.conf.untilDate)
            DashboardManager.timeline.update(this.conf.fromDate, this.conf.untilDate);

    };

    /**
     * Update the fromDate time part
     * @param {Number} time - Timevalue (hours + minutes)
     */
    DashboardChart.prototype.updateFromTime = function(time){
        var date = this.conf.fromDate || this.axis.x2.domain()[0];
        var current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        var context = {
            'select': current.getTime() + time,
        };
        this.updateFromDate(context);
    };

    /**
     * Update the untilDate time
     * @param {Number} time - Timevalue (hours + minutes)
     */
    DashboardChart.prototype.updateUntilTime = function(time){
        var date = this.conf.untilDate || this.axis.x2.domain()[1];
        var current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        var context = {
            'select': current.getTime() + time,
        };
        this.updateUntilDate(context);
    };

    /**
     * Auto-resize focus y scales.
     */
    DashboardChart.prototype.autoScale = function(){
        var log = this.conf.log;
        var lastData = this.currentData;
        var domain = this.axis.x.domain();
        var predict = this.predict.getAll(Date.now());
        var val, s, min, max;

        //get all max values
        var tmpMaxScales = {};
        for(var p in lastData){
            if(!this.probes[p]){
                //console.log(p,this.probes);
                continue;
            }
            s = this.probes[p].scale;
            if(!tmpMaxScales[s]) tmpMaxScales[s] = { 'min': false, 'max': 0};
            max = 0;
            min = false;
            for(var v in lastData[p].values){
                val = lastData[p].values[v].y + lastData[p].values[v].y0;
                max = (max < val) ? val : max;
                if(typeof min === 'boolean') min = val;
                else min = (min > val) ? val : min;
            }

            //parse predicted data if any
            if(predict && predict[p]){
                for(var d in predict[p]){
                    for(v in predict[p][d]){
                        if(predict[p][d][v].x > domain[1].getTime() || predict[p][d][v].x < domain[0].getTime()) continue;
                        val = predict[p][d][v].y;
                        max = (max < val) ? val : max;
                        min = (min > val) ? val : min;
                    }
                }
            }

            if(max > tmpMaxScales[s].max) tmpMaxScales[s].max = max;
            if(typeof tmpMaxScales[s].min === 'boolean') tmpMaxScales[s].min = min;
            else if(min < tmpMaxScales[s].min) tmpMaxScales[s].min = min;
        }
        //apply new domains
        for(s in this.scales){
            if(!tmpMaxScales[s]) continue;
            var y = this.scales[s].y;
            max = tmpMaxScales[s].max;
            min = (log) ? tmpMaxScales[s].min : 0;
            if(!log && min > tmpMaxScales[s].min) min = tmpMaxScales[s].min;
            if(log && !min) min = 0.0001;
            if(max){
                y.domain([min,max]);
                this.scales[s].y = y;
            }
        }

        //redraw
        this.buildAxis();
        this.soft_redraw();
        this.needAutoScale = false;
    };


    /**
     * Handle y-zoom (shift + wheel on focus)
     */
    DashboardChart.prototype.yZoom = function(zoom){
        d3.event.preventDefault();
        d3.event.stopPropagation();
        if(this.conf.log) return;
        var yPos = d3.event.layerY - this.conf.chartMargin.top;
        if(yPos < 0) yPos = 0;

        var fullHeight = this.conf.chartHeight - 22;
        var percentTop = yPos / fullHeight;
        var percentBottom = 1 - yPos / fullHeight;
        var mode = false;
        if(this.opposate && percentTop <= 0.5){
            mode = 'top';
            fullHeight /= 2;
            percentTop = yPos / fullHeight;
            percentBottom = 1 - yPos / fullHeight;
        }
        else if(this.opposate){
            mode = 'bottom';
            fullHeight /= 2;
            yPos -= fullHeight;
            percentBottom = yPos / fullHeight;
            percentTop = 1 - yPos / fullHeight;
        }

        //10% threshold
        if(percentTop < 0.1) percentTop = 0;
        if(percentBottom < 0.1) percentBottom = 0;

        for(var s in this.scales){
            if(mode && mode === 'top' && this.scales[s].reversed) continue;
            else if(mode && mode === 'bottom' && !this.scales[s].reversed) continue;
            var y = this.scales[s].y;
            var y2 = this.scales[s].y2;
            var domain = y.domain();
            var diff = domain[1] - domain[0];

            domain[1] -= diff * percentTop * 0.05 * zoom;
            domain[0] += diff * percentBottom * 0.05 * zoom;

            if(domain[0] < 0) domain[0] = 0;
            if(zoom === -1 && domain[1] > y2.domain()[1]) domain[1] = y2.domain()[1];

            y.domain(domain);
            this.scales[s].y = y;
        }
        this.buildAxis();
        this.soft_redraw();
    };

    /**
     * Zoom in and out
     * @event
     */
    DashboardChart.prototype.zoom = function(){
        var zoom = -1 * d3.event.deltaY;
        //for chrome
        if(zoom === -0 && d3.event.deltaX) zoom = -1 * d3.event.deltaX;
        zoom = (zoom>0) ? 1 : -1;

        if(d3.event.shiftKey){
            this.yZoom(zoom);
            return true;
        }

        if(!this.axis.x.domain()[0].getTime())
            return false;

        var range = this.axis.x.domain();
        var current = range.concat();

        var max = this.axis.x2.domain();

        if(zoom === -1 && max[0].getTime() === range[0].getTime() && max[1].getTime() === range[1].getTime())
            return false;

        d3.event.preventDefault();
        d3.event.stopPropagation();
        var interval = (range[1].getTime() - range[0].getTime()) * zoom * 5 / 100;
        var fullRange = range[1] - range[0];
        var middle = range[0].getTime() + fullRange / 2;

        if(zoom === 1 && this.cursorPos && this.cursorPos.getTime() !== middle){
            interval *= 2;
            var leftRange = (this.cursorPos - range[0]) / fullRange * interval;
            var rightRange = (range[1] - this.cursorPos) / fullRange * interval;

            range[0] = new Date(range[0].getTime() + leftRange);
            range[1] = new Date(range[1].getTime() - rightRange);
        }else{
            range[0] = new Date(range[0].getTime() + interval);
            range[1] = new Date(range[1].getTime() - interval);
        }


        //max zoom level is set to 10min.
        if(zoom === 1 && range[1] - range[0] < 600000)
            return false;

        //we can't zoom beyond the context range
        if(max[0] >= range[0])
            range[0] = max[0];
        if(max[1] <= range[1])
            range[1] = max[1];

        //redraw
        this.axis.x.domain(range);
        for(var c in this.content)
            this.content[c].redraw();
        this.drawLogs();

        this.container.focus.select('.x.axis').call(this.axis.xAxis);
        this.drawGrid();

        this.container.brush.extent(range);
        if(range[0] === max[0] && range[1] === max[1])
            this.container.brush.clear();
        this.container.context.call(this.container.brush);

        //update datefrom
        //this.updateDateForms(range[0],range[1]);

        //check if require to update scale range
        DashboardProbes.worker.postMessage([8,{
            'probes': this.probes,
            'contextTimeline': [current[0].getTime(),current[1].getTime()],
            'focusTimeline': [range[0].getTime(),range[1].getTime()],
            'mode': this.conf.mode
        },this.id]);

        //saving zooming state every 5secs
        this.conf.brushstart = (range[0].getTime() !== current[0].getTime()) ? range[0] : false;
        this.conf.brushend = (range[1].getTime() !== current[1].getTime()) ? range[1] : false;
        if(!this.conf.saving){
            this.conf.saving = true;
            setTimeout(function(){
                this.conf.saving = false;
                var data = {
                    'brushstart': (this.conf.brushstart) ? this.conf.brushstart.getTime() : false,
                    'brushend': (this.conf.brushend) ? this.conf.brushend.getTime() : false
                };
                DashboardManager.savePartData({
                    'id': this.id,
                    'conf': JSON.stringify(data)
                });
            }.bind(this),5000);
        }

    };

    /**
     * Update datepicker's forms values on brush events
     * @param {Date} start
     * @param {Date} end
     */
    DashboardChart.prototype.updateDateForms = function(start,end){
        this.container.date.from.attr('value',start.toLocaleDateString());
        this.container.date.until.attr('value',end.toLocaleDateString());
    };

    return DashboardChart;
});
