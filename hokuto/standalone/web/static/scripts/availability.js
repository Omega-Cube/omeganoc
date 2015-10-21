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

require(['jquery','onoc.createurl'],function(jQuery,createUrl){
    var _CURRENT = false;

    /**
     * Return formated elapsed time
     */
    function getElapsedTime(time){
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
     * Format and return the part title for the timeline drawer
     */
    function getPartTitle(state,start,end,type){
        if(type === 'host')
            var states = ['UP','DOWN','UNREACHABLE'];
        else
            var states = ['OK','WARNING','CRITICAL','UNKNOWN'];

        state = states[state] || String(state);
        var elapsed = getElapsedTime(end - start);
        start = new Date(start);
        start = start.toLocaleDateString()+' ' +start.toLocaleTimeString();
        end = new Date(end);
        end = end.toLocaleDateString()+' '+end.toLocaleTimeString();

        var title = state.concat(' - ',elapsed,'\n',start,' - ',end);
        return title;
    }

    /**
     * Build a timeline part
     */
    function buildTimelinePart(title,percent,type,cla){
        if(type === 'host')
            var span = $('<span title="'+title+'" class="timeline-'+cla+'" style="width:'+percent+'%;"></span>');
        else
            var span = $('<span title="'+title+'" class="servicetimeline-'+cla+'" style="width:'+percent+'%;"></span>');
        return span;
    }

    /**
     * Request Host + attached services SLA
     */
    function requestHostDetails(e){
        var host = $(e.target).data("host");
        var firststate_host = document.requestConfig.firststate_host.value;
        var firststate_service = document.requestConfig.firststate_service.value;
        var range = document.requestConfig.range.value;
        $.ajax({
            'url': createUrl('/services/livestatus/disponibility/host'),
            'type': 'GET',
            'data': {
                'start': Math.round(Date.now() / 1000 - range*24*3600),
                'end': Math.round(Date.now() / 1000),
                'host': host,
                'firststate_host': firststate_host,
                'firststate_service': firststate_service
            }
        }).success(function(response){
            console.log(response);
            var h = host;
            var fulltime = new Date(response.fulltime * 1000);
            var ul = $('<ul></ul>');
            var alt = 0;
            for(var s in response.results){
                var container = $('<li></li>');
                var type = (s === '__HOST__') ? 'host' : 'service';
                if(alt%2)
                    container.addClass('alt');
                alt++;

                container.append('<label>'+host+'.'+s+'</label>');

                container.append('<span class="up" title="'+getElapsedTime(response.results[s].timeup * 1000)+'">Up: '+(Math.round(response.results[s].timeup * 100000 / response.fulltime)/1000)+'%</span>');
                container.append('<span class="down" title="'+getElapsedTime(response.results[s].timedown * 1000)+'">Down: '+(Math.round(response.results[s].timedown * 100000 / response.fulltime)/1000)+'%</span>');
                container.append('<span class="unreachable" title="'+getElapsedTime(response.results[s].timeunreachable * 1000)+'">Unreachable: '+(Math.round(response.results[s].timeunreachable * 100000 / response.fulltime)/1000)+'%</span>');

                var timelineContainer = $('<p class="timeline"></span>');
                var cur = response.start;
                for(var i = 1, len = response.results[s].timeline.length; i < len; i++){
                    var time = response.results[s].timeline[i][1] - cur;
                    var percent = time / response.fulltime * 100;
                    var title = getPartTitle(response.results[s].timeline[i-1][0], cur*1000, response.results[s].timeline[i][1]*1000, type);
                    timelineContainer.append(buildTimelinePart(title,percent,type,response.results[s].timeline[i-1][0]));
                    cur = response.results[s].timeline[i][1];
                }
                var percent = (response.end - cur) / response.fulltime * 100;
                var title = getPartTitle(response.results[s].timeline[i-1][0], cur*1000, response.end*1000, type);
                timelineContainer.append(buildTimelinePart(title,percent,type,response.results[s].timeline[i-1][0]));

                container.append(timelineContainer);
                ul.append(container);
            }
            $('#onoc-availability .results').empty().append(ul);
            $('#onoc-availability .results button').on("click",requestHostDetails);
        });
    }

    /**
     * Called each time a select is updated
     */
    function requestHostUpdate(){
        _CURRENT = 'host';
        var hostgroup = document.requestConfig.hostgroup.value;
        var range = document.requestConfig.range.value;
        var firststate = document.requestConfig.firststate_host.value;
        if(!range || !hostgroup) return false;
        document.requestConfig.services.selectedIndex = 0;

        $.ajax({
            'url': createUrl('/services/livestatus/disponibility/hostgroup'),
            'type': 'GET',
            'data': {
                'start': Math.round(Date.now() / 1000 - range*24*3600),
                'end': Math.round(Date.now() / 1000),
                'hosts': hostgroup,
                'firststate': firststate
            }
        }).success(function(response){
            console.log(response);
            var fulltime = new Date(response.fulltime * 1000);
            var ul = $('<ul></ul>');
            var alt = 0;
            for(var h in response.results){
                var container = $('<li></li>');
                if(alt%2)
                    container.addClass('alt');
                alt++;

                container.append('<label>'+h+'</label>');

                container.append('<span class="up" title="'+getElapsedTime(response.results[h].timeup * 1000)+'">Up: '+(Math.round(response.results[h].timeup * 100000 / response.fulltime)/1000)+'%</span>');
                container.append('<span class="down" title="'+getElapsedTime(response.results[h].timedown * 1000)+'">Down: '+(Math.round(response.results[h].timedown * 100000 / response.fulltime)/1000)+'%</span>');
                container.append('<span class="unreachable" title="'+getElapsedTime(response.results[h].timeunreachable * 1000)+'">Unreachable: '+(Math.round(response.results[h].timeunreachable * 100000 / response.fulltime)/1000)+'%</span>');

                var timelineContainer = $('<p class="timeline"></span>');
                var cur = response.start;
                for(var i = 1, len = response.results[h].timeline.length; i < len; i++){
                    var time = response.results[h].timeline[i][1] - cur;
                    var percent = time / response.fulltime * 100;

                    var title = getPartTitle(response.results[h].timeline[i-1][0], cur*1000, response.results[h].timeline[i][1] * 1000, 'host');
                    timelineContainer.append(buildTimelinePart(title,percent,'host',response.results[h].timeline[i-1][0]));
                    cur = response.results[h].timeline[i][1];
                }
                var percent = (response.end - cur) / response.fulltime * 100;
                var title = getPartTitle(response.results[h].timeline[i-1][0], cur*1000, response.end*1000, 'host');
                timelineContainer.append(buildTimelinePart(title,percent,'host',response.results[h].timeline[i-1][0]));

                container.append(timelineContainer);
                container.append('<span><button data-host="'+h+'">+</button></span>');
                ul.append(container);
            }
            $('#onoc-availability .results').empty().append(ul);
            $('#onoc-availability .results button').on("click",requestHostDetails);

        }).error(function(e){
            console.error('YYYYYUUUUUUUUEEEEEEEEEE',e);
        });
    }

    /**
     *
     */
    function requestServiceUpdate(){
        _CURRENT = 'service';
        var range = document.requestConfig.range.value;
        var service = document.requestConfig.services.value;
        var hostgroup = document.requestConfig.hostgroup.value;
        var firststate = document.requestConfig.firststate_service.value;
        if(hostgroup && !service){
            _CURRENT = 'host';
            return false;
        }
        if(!range || !service || !hostgroup) return false;
        document.requestConfig.hostgroup.selectedIndex = 0;

        $.ajax({
            'url': createUrl('/services/livestatus/disponibility/service'),
            'type': 'GET',
            'data': {
                'start': Math.round(Date.now() / 1000 - range*24*3600),
                'end': Math.round(Date.now() / 1000),
                'service': service,
                'firststate': firststate
            }
        }).success(function(response){
            console.log(response);
            var fulltime = new Date(response.fulltime * 1000);
            var ul = $('<ul></ul>');
            var alt = 0;
            for(var h in response.results){
                for(var s in response.results[h]){
                    var data = response.results[h][s];
                    var container = $('<li></li>');
                    if(alt%2)
                        container.addClass('alt');
                    alt++;

                    container.append('<label>'+h.concat('.',s)+'</label>');

                    container.append('<span class="up" title="'+getElapsedTime(data.timeok * 1000)+'">Ok: '+(Math.round(data.timeok * 100000 / response.fulltime)/1000)+'%</span>');
                    container.append('<span class="warn" title="'+getElapsedTime(data.timewarn * 1000)+'">Warning: '+(Math.round(data.timewarn * 100000 / response.fulltime)/1000)+'%</span>');
                    container.append('<span class="down" title="'+getElapsedTime(data.timecritical * 1000)+'">Critical: '+(Math.round(data.timecritical * 100000 / response.fulltime)/1000)+'%</span>');
                    container.append('<span class="unknown" title="'+getElapsedTime(data.timeunknown * 1000)+'">Unknown: '+(Math.round(data.timeunknown * 100000 / response.fulltime)/1000)+'%</span>');

                    var timelineContainer = $('<p class="timeline"></span>');
                    var cur = response.start;
                    for(var i = 1, len = data.timeline.length; i < len; i++){
                        var time = data.timeline[i][1] - cur;
                        var percent = time / response.fulltime * 100;

                        var title = getPartTitle(data.timeline[i-1][0], cur*1000, data.timeline[i][1]*1000, 'service');
                        timelineContainer.append(buildTimelinePart(title,percent,'service',data.timeline[i-1][0]));
                        cur = data.timeline[i][1];
                    }
                    var percent = (response.end - cur) / response.fulltime * 100;
                    var title = getPartTitle(data.timeline[i-1][0], cur*1000, response.end*1000, 'service');
                    timelineContainer.append(buildTimelinePart(title,percent,'service',data.timeline[i-1][0]));

                    container.append(timelineContainer);
                    ul.append(container);
                }
                $('#onoc-availability .results').empty().append(ul);
            }
        });
    }

    $(document).ready(function(){
        //For the moment we request the availability of each host from the last month
        //TODO: Request

        $('#form-hostgroup').on('change', requestHostUpdate);
        $('#form-services').on('change', requestServiceUpdate);
        $('#form-range').on('change', function(){
            if(!_CURRENT) return false;
            if(_CURRENT === 'host') requestHostUpdate();
            if(_CURRENT === 'service') requestServiceUpdate();
        });
        $('#firststate_host').on('change', function(){
            if(!_CURRENT || _CURRENT === 'service') return false;
            requestHostUpdate();
        });
        $('#firststate_service').on('change', function(){
            if(!_CURRENT || _CURRENT === 'host') return false;
            requestServiceUpdate();
        });
    });
});
