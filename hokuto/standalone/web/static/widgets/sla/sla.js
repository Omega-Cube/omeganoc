/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2014 Omega Cube and contributors
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
define(['jquery','onoc.createurl','externals/d3','dashboards.manager','onoc.calendar'], function(jQuery,createUrl,d3,DashboardManager,Calendar){
    /**
     * Handle the SLA widget
     * @property {Number} id         - Part's id
     * @property {Object} conf       - Part's configuration
     * @property {Object} params     - Store fixed parameters
     * @property {Object} scales     - d3.scales instances
     * @property {Object} axis       - d3.axis instances
     * @property {String} type       - SLA type (service||host)
     * @property {Object} hosts      - Store available hosts and services
     * @property {Date} start        - Global timeline start value
     * @property {Date} end          - Global timeline end value
     * @property {String} host       - Current selected host
     * @property {String} service    - Current selected service
     * @property {Number} firststate - Current assumed firststate
     */
    var Sla = function(){
        this.id = -1;
        this.conf = {
            'width': 100,
            'height': 100,
            'statsheight': 20,
            'timelineheight': 80,
            'brush': {
                'start': false,
                'end': false
            }
        };

        this.params = {
            'statsHeight': 80,
            'host_states' : ['UP','DOWN','UNREACHABLE'],
            'host_colors' : ['#629E51','#BF1B00','#584477'],
            'service_states' : ['OK','WARNING','CRITICAL','UNKNOWN'],
            'service_colors' : ['#629E51','#E5AC0E','#BF1B00','#584477']

        };

        this.containers = {
            'main': false,
            'commands': false,
            'form': false,
            'hosts': false,
            'services': false,
            'firststate': false,
            'svg': false,
            'focus': false,
            'context': false,
            'brush': false,
            'stats': false,
            'date': {
                'from': false,
                'until': false
            }
        };

        this.scales = {
            'x': d3.time.scale().domain([0,100]),
            'y': d3.scale.linear().range([0,60]).domain([0,1]),
            'x2': d3.time.scale().domain([0,100]),
            'y2': d3.scale.linear().range([75,85]).domain([0,1])
        };

        this.axis = {
            'x': d3.svg.axis().orient('bottom'),
            'x2': d3.svg.axis().orient('bottom')
        };

        this.type = false;
        this.hosts = {};
        this.data = {};
        this.start = false;
        this.end = false;
        this.host = false;
        this.service = false;
        this.firststate = false;
    }

    /**
     * Attach to the widget's container
     * @param {DOMElement} container - The main container
     * @param {Object} options       - Current part configuration
     * @param {Widget} widget        - Widget instance
     */
    Sla.prototype.attachTo = function(container, options, widget){
        this.id = options.id;
        this.containers.main = $(container);
        this.containers.main.addClass('slacontainer');

        //set boxsizes
        var width = DashboardManager.getPartWidth(options.width) - 5;
        var height = DashboardManager.getPartHeight(options.height);

        this.conf.width = width;
        this.conf.timelineheight = height - this.params.statsHeight;
        this.conf.height = height;

        //TODO: REFACTORME
        this.containers.header = widget._header;
        this.containers.commands = widget._commands;

        this.handleScrolls(container);

        if(options.conf){
            if(options.conf.host)
                this.host = options.conf.host;
            if(options.conf.service)
                this.service = options.conf.service;
            if(options.conf.firststate)
                this.firststate = options.conf.firststate;
            if(Number(options.conf.start)){
                this.start = new Date(options.conf.start * 1000);

            }
            if(Number(options.conf.end))
                this.end = new Date(options.conf.end * 1000);
            if(Number(options.conf.brushstart))
                this.conf.brush.start = new Date(options.conf.brushstart * 1000);
            if(Number(options.conf.brushend))
                this.conf.brush.end = new Date(options.conf.brushend * 1000);

            //update globale timeline
            DashboardManager.timeline.update(this.start, this.end);
        }

        this.buildCommands();
        this.buildContainer(container);

        if(this.host)
            this.changeTarget();

        //main timeline events
        $('#dashboard-global-timeline').on('timeline.update',function(e,start,end){
            this.conf.brush.start = start;
            this.conf.brush.end = end;
            if(start <= this.start && end >= this.end){
                this.conf.brush.start = false;
                this.conf.brush.end = false;
            }
            if(start < this.start)
                this.start = start;
            if(end > this.end)
                this.end = end;

            this.changeTarget();
        }.bind(this));

    }

    /**
     * Build Commands UI
     */
    Sla.prototype.buildCommands = function(){
        var container = this.containers.commands;

        //refresh button
        var refresh = this.containers.header.find('.refresh');
        refresh.click(function(e){
            e.target.setAttribute('class','refresh disabled');
            this.changeTarget();
        }.bind(this));
        
        //menus
        var actionsmenu = this.containers.header.find('.actions ul');

        var fromdatechange = function(t){
            var newFrom = false;
            if(t < 0){
                newFrom = new Date(Date.now() + t);
                this.end = false;
            }else
                newFrom = new Date(t);
            this.start = newFrom;
            this.conf.brush.start = false;
            this.conf.brush.end = false;
            this.changeTarget();
            //update globale timeline
            DashboardManager.timeline.update(this.start, this.end);
        }.bind(this);

        var untildatechange = function(t){
            var newEnd = new Date(t);
            this.end = newEnd;
            this.conf.brush.start = false;
            this.conf.brush.end = false;
            this.changeTarget();
            //update globale timeline
            DashboardManager.timeline.update(this.start, this.end);
        }.bind(this);

        // Date commands
        var datemenu = this.containers.header.find('.datepicker ul');

        var tmp = jQuery('<li>Last year</li>');
        tmp.click(function(){ fromdatechange(- 3600 * 1000 * 24 * 365);});
        datemenu.prepend(tmp);

        tmp = jQuery('<li>Current year</li>');
        tmp.click(function(){
            var date = new Date(
                new Date().getFullYear(),
                0,1,1,0
            ).getTime();
            this.end = false;
            fromdatechange(date);
        }.bind(this));
        datemenu.prepend(tmp);


        tmp = jQuery('<li>Last 30 days</li>');
        tmp.click(function(){ fromdatechange(- 3600 * 1000 * 24 * 30);});
        datemenu.prepend(tmp);

        tmp = jQuery('<li>Current month</li>');
        tmp.click(function(){
            var date = new Date(
                new Date().getFullYear(),
                new Date().getMonth(),
                1,1,0
            ).getTime();
            this.end = false;
            fromdatechange(date);
        }.bind(this));
        datemenu.prepend(tmp);


        var tmp = jQuery('<li>Last 24 hours</li>');
        tmp.click(function(){ fromdatechange(- 3600 * 1000 * 24);});
        datemenu.prepend(tmp);

        //datepicker
        this.containers.date = {
            'from': datemenu.find('.datePicker.from'),
            'until': datemenu.find('.datePicker.until')
        }
        var fromCalendar = new Calendar(this.containers.date.from, function(d){
            fromdatechange(d);
        }, this.containers.main);
        if(this.start)
            fromCalendar.set(this.start);
        var untilCalendar = new Calendar(this.containers.date.until, function(d){
            untildatechange(d);
        }, this.containers.main);
        if(this.end)
            untilCalendar.set(this.end);

        // Actions
        //Reset
        var reset = $('<li>reset</li>');
        reset.on('click',this.reset.bind(this));
        actionsmenu.prepend(reset);

        //target selection form
        var form = $('<form class="sla-request" name="sla-request-'+this.id+'"></form>');

        this.containers.hosts = $('<select name="hosts"><option value="">Hosts</option></select');
        form.append(this.containers.hosts);

        this.containers.services = $('<select name="services" ><option value="">Services</option></select');
        form.append(this.containers.services);

        this.containers.firststate = $('<select name="firststate"><option value="">First assumed state</option></select>');
        form.append(this.containers.firststate);
        container.append(form);
        setTimeout(this.buildHostsForm.bind(this),0);

        //bind events
        this.containers.hosts.on('change',this.changeHostEvent.bind(this));
        this.containers.services.on('change',this.changeServiceEvent.bind(this));
        this.containers.firststate.on('change',function(){
            this.firststate = this.containers.firststate[0].value || 0;
            this.changeTarget();
        }.bind(this));
    }

    /**
     * Build main container (svg)
     * @param {DOMElement} container - The content container
     */
    Sla.prototype.buildContainer = function(container){
        var svg = d3.select(container).append("svg")
            .attr("width", this.conf.width)
            .attr("height", this.conf.height)
            .attr("class","svg");

        svg.append("defs").append("clipPath")
            .attr("id", "clip_"+this.id)
            .append("rect")
            .attr("width", this.conf.width - 20)
            .attr("height", this.conf.height)
            .attr("x", 20);

        var focus = svg.append('g')
            .attr('class','focus')
            .attr('clip-path','url(#clip_'+this.id+')');

        var context = svg.append('g')
            .attr('class','context');

        var brush = d3.svg.brush()
            .x(this.scales.x2)
            .on("brush", this.brushed.bind(this))
            .on("brushend", function(){
                var data = {
                    'id': this.id
                };
                var conf = {
                    'brushstart' : (this.conf.brush.start.getTime() !== this.scales.x2.domain()[0].getTime()) ? Math.round(this.conf.brush.start.getTime() / 1000) : false,
                    'brushend' : (this.conf.brush.end.getTime() !== this.scales.x2.domain()[1].getTime()) ? Math.round(this.conf.brush.end.getTime() / 1000) : false
                }
                data.conf = JSON.stringify(conf);
                DashboardManager.savePartData(data);
            }.bind(this));

        svg.append('g')
            .attr('class','x brush')
            .call(brush)
            .selectAll('rect')
            .attr('y', this.scales.y2(0) - 1)
            .attr('height', this.scales.y2(1) - this.scales.y2(0) + 2)
            .attr('fill-opacity',0.5);
        svg.select('.brush .background').attr('width',this.conf.width);

        var xAxis = svg.append('g')
            .attr('class','x axis')
            .attr('transform','translate(0,'+this.scales.y(1)+')');
        var x2Axis = svg.append('g')
            .attr('class','x2 axis')
            .attr('transform','translate(0,'+this.scales.y2(1)+')');

        //stats container
        var stats = svg.append('g')
            .attr('class','stats')
            .attr('transform','translate(0,'+this.conf.timelineheight+')');

        this.containers.svg = svg;
        this.containers.focus = focus;
        this.containers.context = context;
        this.containers.brush = brush;
        this.containers.stats = stats;
    }

    /**
     * Build target form
     */
    Sla.prototype.buildHostsForm = function(){
        //hosts
        var hosts = this.containers.hosts;
        var services = this.containers.services;
        $.ajax({
            'url':createUrl('/services/livestatus/get/hosts'),
            'type': 'GET'
        }).success(function(response){
            hosts.html('<option selected="selected">Hosts</option>');
            for(var i = 0, len = response.results.length; i<len; i++){
                hosts.append('<option value="'+response.results[i].name+'">'+response.results[i].name+'</option>');
                this.hosts[response.results[i].name] = response.results[i].services;
            }

            if(this.host){
                for(var i in this.containers.hosts[0].options){
                    if(this.containers.hosts[0].options[i].value === this.host){
                        this.containers.hosts[0].options[i].selected = "1";
                        break;
                    }
                }

                this.containers.services.html('<option selected="selected" value="">Services</option>');
                for(var s in this.hosts[this.host])
                    this.containers.services.append('<option value="'+this.hosts[this.host][s]+'">'+this.hosts[this.host][s]+'</option>');
                if(this.service){
                    for(var i in this.containers.services[0].options){
                        if(this.containers.services[0].options[i].value === this.service){
                            this.containers.services[0].options[i].selected = "1";
                            break;
                        }
                    }
                }
            }
        }.bind(this)).error(function(e){
            console.error(e);
        });
    }

    /**
     * resize the svg
     * @param {Number} width - Part width in gridster unit
     * @param {Number} height - Part height in gridster unit
     */
    Sla.prototype.resize = function(width,height){
        //main
        var oldWidth = this.conf.width;
        var width = DashboardManager.getPartWidth(width) - 5;
        var height = DashboardManager.getPartHeight(height);
        this.conf.width = width;
        this.conf.height = height;

        //axis ticks size
        var maxTicks = Math.floor(this.conf.width / 80);
        this.axis.x.ticks(maxTicks);
        this.axis.x2.ticks(maxTicks);

        //parts
        this.conf.statsheight = this.params.statsHeight;
        this.conf.timelineheight = height - this.params.statsHeight;
        this.containers.svg.attr("width", this.conf.width)
            .attr("height", this.conf.height);
        this.containers.svg.select('.brush .background').attr('width',this.conf.width);

        //scales
        this.scales.x.range([20,this.conf.width]);
        this.scales.x2.range([20,this.conf.width]);
        this.scales.y.range([0,this.conf.timelineheight * 0.6]);
        this.scales.y2.range([this.conf.timelineheight * 0.75, this.conf.timelineheight]);

        //axis
        this.containers.svg.select('.x.axis').attr('transform','translate(0,'+this.scales.y(1)+')');
        this.containers.svg.select('.x2.axis').attr('transform','translate(0,'+this.scales.y2(1)+')');

        //stats
        this.containers.stats.attr('transform','translate(0,'+this.conf.timelineheight+')');

        //brushes
        this.containers.svg.select('.brush.x').selectAll('rect').attr('height', this.scales.y2(1) - this.scales.y2(0) + 2).attr('y',this.scales.y2(0) - 1);
        this.containers.svg.select('.brush .background').attr('width',this.conf.width);

        var brushWidth = this.containers.svg.select('.brush').select('.extent').attr('width');
        var brushPosX = this.containers.svg.select('.brush').select('.extent').attr('x');
        this.containers.svg.select('.brush').select('.extent')
            .attr('width', brushWidth * this.conf.width/oldWidth)
            .attr('x', brushPosX * this.conf.width/oldWidth);

        //clippath
        this.containers.svg.select('clipPath').attr("width", this.conf.width - 20).attr("height", this.conf.timelineheight)
            .select('rect').attr("width", this.conf.width - 20).attr("height", this.conf.timelineheight).attr('x',20);

        //redraw
        if(this.data.timeline)
            this.draw();
    };

    /**
     * Handle target select event.
     * @event
     */
    Sla.prototype.changeServiceEvent = function(event){
        if(this.service === this.containers.services[0].value) return;
        this.service = this.containers.services[0].value || null;
        this.changeTarget();
    };

     /**
     * Handle target select event.
     * @event
     */
    Sla.prototype.changeHostEvent = function(event){
        var newHost = event.target.value;
        if(!newHost) return;

        //update services
        this.containers.services.html('<option selected="selected" value="">Services</option>');
        for(var s in this.hosts[newHost])
            this.containers.services.append('<option value="'+this.hosts[newHost][s]+'">'+this.hosts[newHost][s]+'</option>');

        if(this.host === newHost) return;

        this.host = this.containers.hosts[0].value;
        this.changeTarget();
    };

    /**
     * Brush event
     * @event
     */
    Sla.prototype.brushed = function(e){
        this.scales.x.domain(this.containers.brush.empty() ? this.scales.x2.domain() : this.containers.brush.extent());
        var domain = this.scales.x.domain();
        this.updateDateForms(domain[0],domain[1]);
        this.conf.brush.start = domain[0];
        this.conf.brush.end = domain[1];
        this.draw();
        this.drawStats();
    }

    /**
     * Change the current target
     */
    Sla.prototype.changeTarget = function(){
        var url = false;
        var data = false;
        var host = this.host;
        var service = this.service;

        //update states sekector
        var newType = (service) ? 'service' : 'host';
        if(newType !== this.type){
            this.type = newType;
            var newStates = (newType === 'host') ? this.params.host_states : this.params.service_states;
            this.containers.firststate.empty();
            for(var i = 0, len = newStates.length; i<len; i++){
                var state = $('<option value="'+i+'">'+newStates[i]+'</option>');
                if(i == this.firststate)
                    state.attr('selected',"1");
                this.containers.firststate.append(state);
            }
        }
        var firststate = this.firststate || 0;

        //build and send request
        url = createUrl('/services/livestatus/disponibility/get');
        data = {
            'host': host,
            'firststate': firststate
        };

        if(service)
            data.service = service;
        if(this.start)
            data.start = Math.round(this.start.getTime() / 1000);
        if(this.end)
            data.end = Math.round(this.end.getTime() / 1000);

        var newConf = data;
        if(this.conf.brush.start)
            newConf.brushstart = Math.round(this.conf.brush.start.getTime() / 1000);
        if(this.conf.brush.end)
            newConf.brushend = Math.round(this.conf.brush.end.getTime() / 1000);

        newConf = JSON.stringify(newConf);
        DashboardManager.savePartData({
            'id': this.id,
            'conf': newConf
        });

        $.ajax({
            'url': url,
            'type': 'GET',
            'data': data
        }).success(function(response){
            this.drawResults(response);
            this.containers.header.find('.refresh').attr('class','refresh');
        }.bind(this)).error(function(e){ console.error(e); });
    }

    /**
     * Return string formated elapsed time
     * @param {Number} time - Elapsed time value (ms)
     */
    Sla.prototype.getElapsedTime = function(time){
        var d = new Date(time);
        var result = '';

        var Y = d.getYear() - 70;
        if(Y)
            result = result.concat(Y,'y ');
        if(d.getMonth())
            result = result.concat(d.getMonth(),'month ');
        if(d.getDate() > 1)
            result = result.concat(d.getDate() - 1,'d ');
        if(d.getHours() > 1)
            result = result.concat(d.getHours() - 1,'h ');
        if(d.getMinutes())
            result = result.concat(d.getMinutes(),'min ');
        if(d.getSeconds())
            result = result.concat(d.getSeconds(),'s');

        return result;
    }

    /**
     * Overdrive window scrolls events for this element
     * TODO: should be a generic function, can be usefull for futur widgets too
     */
    Sla.prototype.handleScrolls = function(container){
        /*container.addEventListener('wheel',function(e){
            e.preventDefault();
            e.stopPropagation();
            var content = e.target;
            while(content && content.tagName !== 'DIV') content = content.parentElement;
            content.scrollTop += e.deltaY * 10;
        },true);*/
        container.addEventListener('mousedown',function(e){ e.stopPropagation();},false);
    }

    /**
     * Draw charts from the server response
     * @param {Object} response - server response
     */
    Sla.prototype.drawResults = function(response){
        var data = response.results;
        this.data = response.results;
        var host = response.host;
        var service = response.service || false;

        //update the timeline
        var start = new Date(response.start * 1000);
        var end = new Date(response.end * 1000);

        //TODO: use resize method instead
        var maxTicks = Math.floor(this.conf.width / 80);
        this.scales.x.domain([start,end]).range([20,this.conf.width]);
        this.axis.x.ticks(maxTicks).scale(this.scales.x);
        this.scales.x2.domain([start,end]).range([20,this.conf.width]);
        this.axis.x2.ticks(maxTicks).scale(this.scales.x2);
        this.scales.y.range([0,this.conf.timelineheight * 0.6]);
        this.scales.y2.range([this.conf.timelineheight * 0.75, this.conf.timelineheight]);

        this.containers.svg.select('.x.axis').attr('transform','translate(0,'+this.scales.y(1)+')');
        this.containers.svg.select('.x2.axis').attr('transform','translate(0,'+this.scales.y2(1)+')');

        this.containers.svg.select('.brush.x').selectAll('rect').attr('height', this.scales.y2(1) - this.scales.y2(0) + 2).attr('y',this.scales.y2(0) - 1);
        this.containers.svg.select('.brush .background').attr('width',this.conf.width);

        this.updateDateForms(start,end);

        //this.start = start;
        //this.end = end;

        //if brush is set trigger the event
        if(this.conf.brush.start && this.conf.brush.end){
            this.containers.brush.extent([this.conf.brush.start, this.conf.brush.end]);
            this.containers.svg.select('.x.brush').call(this.containers.brush);
            this.scales.x.domain([this.conf.brush.start, this.conf.brush.end]).range([20,this.conf.width]);
        }else{
            this.containers.brush.clear();
            this.containers.brush(this.containers.svg.select('.x.brush'));
        }

        //draw the svg
        this.draw();

        //fill stats
        this.drawStats();
    }


    /**
     * Draw the svg
     */
    Sla.prototype.draw = function(){
        //draw the svg
        var data = this.data;
        var focus = this.containers.focus;
        var context = this.containers.context;
        var timeline = data.timeline;
        var colors = (this.type === 'host') ? this.params.host_colors : this.params.service_colors;
        var states = (this.type === 'host') ? this.params.host_states : this.params.service_states;

        this.containers.svg.select('.x.axis').call(this.axis.x);
        this.containers.svg.select('.x2.axis').call(this.axis.x2);

        var parts = [];
        for(var i = 1, len = timeline.length; i<=len; i++){
            var last = timeline[i - 1];
            var event = timeline[i];
            if(!event) event = this.scales.x2.domain()[1].getTime();
            else event = event[1] * 1000;
            var part = {
                start: new Date(last[1] * 1000),
                end: new Date(event),
                type: last[0],
                color: colors[last[0]]
            }

            parts.push(part);
        }

        var x = this.scales.x;
        var x2 = this.scales.x2;

        //focus
        var rects = focus.selectAll('rect').data(parts);
        rects.exit().remove();
        rects.enter().append('rect')
            .attr('stroke','black')
            .attr('stroke-width','0.05')
            .attr('class','part')
            .append('title');
        rects.attr('x', function(d){ return x(d.start); })
            .attr('y',this.scales.y(0))
            .attr('height',this.scales.y(1) - this.scales.y(0))
            .attr('width', function(d){ return x(d.end) - x(d.start)})
            .attr('fill', function(d){ return d.color})
            .select('title').text(function(d){
                var title = states[d.type].concat(
                    " : ",
                    this.getElapsedTime(d.end.getTime() - d.start.getTime()),
                    "\n",
                    "From : ",
                    d.start.toLocaleDateString(),
                    " ",
                    d.start.toLocaleTimeString(),
                    " - To :",
                    d.end.toLocaleDateString(),
                    " ",
                    d.end.toLocaleTimeString()
                )
                return title;
            }.bind(this));

        //context
        var rects = context.selectAll('rect').data(parts);
        rects.exit().remove();
        rects.enter().append('rect')
            .attr('stroke','black')
            .attr('stroke-width','0.05');
        rects.attr('x', function(d){ return x2(d.start); })
            .attr('y',this.scales.y2(0))
            .attr('height',this.scales.y2(1) - this.scales.y2(0))
            .attr('width', function(d){ return x2(d.end) - x2(d.start)})
            .attr('fill', function(d){ return d.color});
    }

    /**
     * Draw stats data
     */
    Sla.prototype.drawStats = function(){
        var timeline = this.data.timeline;
        var start = this.scales.x.domain()[0];
        var end = this.scales.x.domain()[1];
        var fulltime = (end.getTime() - start.getTime()) / 1000;
        var states = (this.type === 'host') ? this.params.host_states : this.params.service_states;
        var colors = (this.type === 'host') ? this.params.host_colors : this.params.service_colors;

        //get times
        var times = {
            'up': 0,
            'down': 0,
            'unreachable': 0,
            'unknown': 0
        };

        //in case that there isn't any record, set the firststate as the fulltime state.
        if(timeline.length === 1){
            switch(timeline[0][0]){
            case 0:
                times.up = fulltime;
                break;
            case 1:
                times.down = fulltime;
                break;
            case 2:
                times.unreachable = fulltime;
                break;
            case 3:
                times.unknown = fulltime;
                break;
            }
        }else{
            for(var i = 1, len = timeline.length; i<len; i++){
                var last = timeline[i - 1];
                var current = timeline[i];
                if(current[1] * 1000 < start.getTime() && i+1 !== len)
                    continue;

                var lasttime = (last[1] * 1000 < start.getTime()) ? start.getTime() / 1000 : last[1];
                var currentTime = (current[1] * 1000 >= end.getTime()) ? end.getTime() / 1000 : current[1];

                if(current[1] * 1000 >= start.getTime()){
                    switch(last[0]){
                    case 0:
                        times.up += currentTime - lasttime;
                        break;
                    case 1:
                        times.down += currentTime - lasttime;
                        break;
                    case 2:
                        times.unreachable += currentTime - lasttime;
                        break;
                    case 3:
                        times.unknown += currentTime - lasttime;
                        break;
                    }
                }

                if(i + 1 === len || current[1] * 1000 >= end.getTime()){
                    if(i+1 === len && current[1] * 1000 < start.getTime())
                        currentTime = (current[1] * 1000 <= start.getTime()) ? start.getTime() / 1000 : current[1];

                    switch(current[0]){
                    case 0:
                        times.up += end.getTime() / 1000 - currentTime;
                        break;
                    case 1:
                        times.down += end.getTime() / 1000 - currentTime;
                        break;
                    case 2:
                        times.unreachable += end.getTime() / 1000 - currentTime;
                        break;
                    case 3:
                        times.unknown += end.getTime() / 1000 - currentTime;
                        break;
                    }

                    break;
                }
            }
        }

        //get percents
        var percents = [];
        percents.push(Math.round(times.up * 100000 / fulltime)/1000);
        percents.push(Math.round(times.down * 100000 / fulltime)/1000);
        percents.push(Math.round(times.unreachable * 100000 / fulltime)/1000);
        percents.push(Math.round(times.unknown * 100000 / fulltime)/1000);

        //draw
        var space = this.conf.width / 4;
        this.containers.stats.selectAll('*').remove();
        for(var i = 0, len = states.length; i<len; i++){
            this.containers.stats.append('rect')
                .attr('fill',colors[i])
                .attr('stroke','grey')
                .attr('stroke-width',1)
                .attr('width',10)
                .attr('height',10)
                .attr('x', i*space + 20)
                .attr('y', 30);
            this.containers.stats.append('text')
                .attr('y',39)
                .attr('x', i*space + 33)
                .attr('font-size',11)
                .attr('stroke','white')
                .attr('stroke-width',0)
                .attr('fill','white')
                .text(states[i]+" : "+percents[i]+'%');
        }
    };

    /**
     * Update datepicker forms values
     * @param {Date} start - Start date instance
     * @param {Date} end   - End date instance
     */
    Sla.prototype.updateDateForms = function(start,end){
        this.containers.date.from.attr('value',start.toLocaleDateString());
        this.containers.date.until.attr('value',end.toLocaleDateString());
    };

    /**
     * Reset all values
     */
    Sla.prototype.reset = function(){
        var data = { 'id': this.id };
        var conf = {};
        //reset brush
        this.containers.brush.clear();
        this.containers.svg.select('.x.brush').call(this.containers.brush);

        this.conf.brush.start = false;
        this.conf.brush.end = false;
        this.end = false;
        conf.brushstart = false;
        conf.brushend = false;
        conf.end = false;

        data.conf = JSON.stringify(conf);
        DashboardManager.savePartData(data);
        this.changeTarget();
    };

    /**
     * Called when this widget is deleted
     */
    Sla.prototype.remove = function(){

    };

    /**
     * Sla widgets default config
     */
    Sla.default = function(){
        return {
            width: 8,
            height: 5,
        };
    };

    return Sla;
});
