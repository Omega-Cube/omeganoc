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
    'libs/rsvp',
    'onoc.config', 
    'console', 
    'onoc.xhr', 
    'onoc.createurl',
    'argumentserror',
    'workers/probes.probe', 
    'workers/probes.log'
], function(
    RSVP,
    Config, 
    Console, 
    OnocXHR, 
    createUrl, 
    ArgumentsError,
    Probe, 
    Log
) {
    var separator = Config.separator();

    /**
     * The DashboardsWorker class is a worker server proxy.
     */

    function DashboardsWorker(server) {
        this._server = server;

        this.probes = {};
        this.logs = {};
        this.predicted = {};
    }

    DashboardsWorker.prototype.addProbe = function(probeName, interval) {
        if(!this.probes[probeName]){
            this.probes[probeName] = new Probe();
            this.probes[probeName].setInterval(interval);
            var nameParts = probeName.split(separator);
            if(nameParts.length > 1){
                var hostName = nameParts[0];
                var serviceName = nameParts[1];
                this.logs[hostName] = this.logs[hostName] || {};
                if(!this.logs[hostName][serviceName])
                    this.logs[hostName][serviceName] = new Log();
            }
        }
    };

    DashboardsWorker.prototype.fetch = function(probesList, start, end) {

        probesList = probesList || Object.keys(this.probes);
        if(!Array.isArray(probesList)) 
            probesList = Object.keys(probesList);

        // Fetch logs
        var details = [];
        for(var i=0, len = probesList.length; i < len; i++) {
            var curProbe = probesList[i];
            if(start || end)
                this.probes[probesList[i]].setRequestedDate(start,end);
            details = curProbe.split(separator);

            if(!!this.logs[details[0]] && !!this.logs[details[0]][details[1]])
                this.fetchLog(details[0] ,details[1], start, end);
        }

        // Fetch metric data
        var query = {'probes': probesList };
        if(start)
            query['start'] = Math.floor(start / 1000);
        if(end)
            query['end'] = Math.floor(end / 1000);

        OnocXHR.getJson(createUrl('/services/metrics/values'), query).then(function(data) {
            if(data) {
                // The data is NOT USED by the client... don't bother sending it
                ///postMessage([1,data,signature]);
                //this.trigger('metricsReceived', data);

                this._parseResponseData(data);
            }
        }.bind(this));

        // Fetch predicted data
        this.fetchPredicts(probesList);
    };

    DashboardsWorker.prototype.fetchLog = function(hostName, serviceName, start, end) {
        if(start) 
            start /= 1000;
        if(end)
            end /= 1000;

        if(!this.logs[hostName][serviceName].getLogs().length) {
            var url = createUrl('/services/livestatus/get/service/logs/' + hostName + '/' + serviceName + '/');

            return OnocXHR.getJson(url, { 
                'start': start, 
                'end': end
            }).then(function(data) {
                this.logs[hostName][serviceName].setData(data);
                var results = {};
                results[hostName] = {};
                results[hostName][serviceName] = this.logs[hostName][serviceName].getLogs();
                ///postMessage([10,results,sig]);
                //this.trigger('logsReceived', results);
                return results;
            }.bind(this));
        }
        else {
            var results = {};
            results[hostName] = {};
            results[hostName][serviceName] = this.logs[hostName][serviceName].getLogs();
            ///postMessage([10,results,sig]);
            return new RSVP.Promise(function(resolve) {
                resolve(results);
            });
            //this.trigger('logsReceived', results);
        }
    };

    DashboardsWorker.prototype.fetchPredicts = function(probesList) {
        //TODO check if predict data already fetched to prevent useless requests
        return OnocXHR.getJson(createUrl('/services/predict/forecast'), { 
            'probes': probesList
        }).then(function(data) {
            ///postMessage([11,data,sig]);
            //this.trigger('predictReceived', data);
            for(var probe in data) {
                this.probes[probe].setPredicted(data[probe]);
                this.predicted[probe] = data[probe];
            }
            return data;
        }.bind(this));
    };

    DashboardsWorker.prototype._parseResponseData = function(response) {
        /* Original parsing logic (used with graphite), to be kept for reference
        for(var d in response){
            //TODO: should handle errors messages and code
            if(!response[d].values) continue;
            response[d].start *= 1000;
            response[d].end *= 1000;
            response[d].step *= 1000;

            var time = response[d].start;
            // Distance between each Graphite point, in ms
            var step = response[d].step;
            var tmp = [];
            var start = true;
            var query = d.split(separator);
            var interval = Math.round((this.probes[d].getInterval() * 60000) / step) || 1;
            var firstKnownValue = false;

            for(var v = 0, len = response[d].values.length; v < len; v+=interval){

                for(var value = null, i = 0; i<interval;i++){
                    value = response[d].values[v + i];
                    if(value) break;
                }
                if( !firstKnownValue && value)
                    firstKnownValue = time;
                //graphite response is filled with over9000 null values, so we take only real metrics.
                if(firstKnownValue)
                    tmp.push(value);
                time+= step * interval;
            }

            response[d].values = tmp;
            if(!firstKnownValue) firstKnownValue = Date.now();
            this.probes[d].update(response[d].values, firstKnownValue, response[d].end, step * interval);
        }
        */

        // New parsing logic, used with Influx
        // The objective here is not to create somethink efficient, but rather something that
        // will get the closest possible result when compared to the original Graphite implementation
        // Optimizations will come later, with a more general reorganization
        var interval = 0;
        var current;
        var lastFilledSlot, firstFilledSlot, currentSlot, point, points;
        for(var id in response) {
            interval = (this.probes[id].getInterval() * 60) || 60;
            current = response[id];

            firstFilledSlot = 0;
            lastFilledSlot = 0;
            points = [];
            for(var i = 0, imax = current.values.length; i < imax; ++i) {
                point = current.values[i];
                currentSlot = point.time - (point.time % interval);
                if(firstFilledSlot === 0) {
                    firstFilledSlot = currentSlot;
                }
                if(currentSlot > lastFilledSlot) {
                    // Take the current value for the current slot.
                    // That means that if there are several values in the same slot,
                    // only the last one will be used. (that should happen fairely 
                    // rarely though)

                    if(lastFilledSlot > 0) {
                        // Make sure that there are no empty slots between this value and the previous one
                        // If so, fill them with null values
                        for(var emptySlot = lastFilledSlot + interval; emptySlot < currentSlot; emptySlot += interval) {
                            points.push(null);
                        }
                    }

                    points.push(point.value);
                    lastFilledSlot = currentSlot;
                }
            }

            // If there was no data at all
            if(firstFilledSlot === 0) {
                firstFilledSlot = Date.now();
            }

            // the update function expects times in ms, so we have to multiply all the timestamps here
            this.probes[id].update(points, firstFilledSlot * 1000, lastFilledSlot * 1000 + interval * 1000 - 1, interval * 1000);
        }
    };

    DashboardsWorker.prototype.get = function(probesList, start, end, mode) {
        var results = {
            metrics: {},
        };
        var stacks = {};

        mode = mode || 'max';
        if(start && start.constructor === Date)
            start = start.getTime();
        if(end && end.constructor === Date)
            end = end.getTime();
        for(var probeName in probesList) {
            var curProbe = probesList[probeName];
            if(curProbe.stacked){
                stacks[curProbe.scale] = stacks[curProbe.scale] || [];
                stacks[curProbe.scale].push(probeName);
            }
            else {
                var data = this.getProbe(probeName, start, end, mode);
                if(data)
                    results.metrics[probeName] = data;
            }
        }

        //get stacked data
        for(var i in stacks) {
            var values = {};
            var curStack = stacks[i];
            for(var j in curStack) {
                values[curStack[j]] = this.getProbe(curStack[j], start, end, mode, 1);
            }

            //aggregate theme
            var aggregate = this.aggregateStack(values, mode);
            for(var stack in aggregate) {
                results.metrics[stack] = aggregate[stack];
            }
        }

        ///postMessage([6,results,signature]);

        var logs = this.getLogs(probesList, start, end);
        if(logs) {
            ///postMessage([10,logs,signature]);
            //this.trigger('logsReceived', logs);
            results.logs = logs;
        }

        var predictions = this.getPredicts(probesList);
        if(predictions) {
            results.predicts = predictions;
        }

        return results;
    };

    DashboardsWorker.prototype.getLogs = function(probesList, start, end) {
        var results = {};
        var hostName, serviceName, nameParts;
        for(var probeName in probesList){
            nameParts = probeName.split(separator);
            hostName = nameParts[0];
            serviceName = nameParts[1];
            if(serviceName && hostName) {
                var logs = this.logs[hostName][serviceName].getLogs(start, end);
                if(!logs.length)
                    continue;
                if(!results[hostName])
                    results[hostName] = {};
                if(!results[hostName][serviceName])
                    results[hostName][serviceName] = logs;
            }
        }
        if(!Object.keys(results).length)
            return false;
        return results;
    };

    DashboardsWorker.prototype.getPredicts = function(probesList) {
        var result = {};

        for(var probeName in probesList) {
            result[probeName] = this.predicted[probeName];
        }

        return result;
    };

    DashboardsWorker._getInterpolated = function(time, previous, next) {
        var diff = next.y - previous.y;
        var percent = (next.x - previous.x) / 100;
        percent = (time - previous.x) / percent;
        return (previous.y + percent / 100 * diff);
    };

    DashboardsWorker.prototype.aggregateStack = function(stack, mode) {
        var results = {};

        for(var probeName in stack) {
            var probe = stack[probeName];
            var interval = this.probes[probeName]._getAggregateLevel(probe.start,probe.end);
            var step = this.probes[probeName].getStep();
            var newValues = [];
            var cached = {};

            for(var i = 0, probeLen = probe.values.length; i < probeLen; i += interval) {
                var previous = false;
                var newValue = 0;

                for(var j = 0; j < interval; j++){
                    //get others values
                    if(typeof probe.values[i + j] !== 'undefined') {
                        var time = probe.values[i + j].x;
                        var value = probe.values[i + j].y;
                        for(var q in stack){
                            if(q !== probeName) {
                                for(var k = cached[q] || 0, len = stack[q].values.length; k < len; k++){
                                    var tmp = stack[q].values[k];
                                    if(tmp.x.getTime() < time.getTime()) 
                                        continue;
                                    if(tmp.x.getTime() === time.getTime())
                                        value += tmp.y;
                                    else
                                        value += (stack[q].values[k - 1]) ? DashboardsWorker._getInterpolated(time, stack[q].values[k - 1], stack[q].values[k]) : 0;

                                    cached[q] = k;
                                    break;
                                }
                            }
                        }
                        if(mode === 'max') {
                            if(previous <= value){
                                previous = value;
                                newValue = probe.values[i+j].y;
                            }
                        }
                        else if(mode === 'min') {
                            if(typeof previous === 'boolean' || previous > value){
                                previous = value;
                                newValue = probe.values[i+j].y;
                            }
                        }
                        else {
                            newValue += (probe.values[i+j].y - newValue) / (j + 1);
                        }
                        if(!probe.values[i+j+1]) 
                            break;
                    }
                }

                if(isNaN(newValue)) {
                    Console.warn('NaN spotted on stacked probe!');
                    continue;
                }

                if(probe.values[i]) {
                    newValues.push({
                        'y': newValue,
                        'x': new Date(probe.values[i].x.getTime() + interval * step / 2),
                        'start': false,
                        'y0': 0
                    });
                }
            }
            results[probeName] = {
                'values': newValues,
                'start': probe.start,
                'end': probe.end,
                'range': probe.range
            };
        }

        return results;
    };

    DashboardsWorker.prototype.getProbe = function(probeName, start, end, mode, interval) {
        if(!this.probes[probeName])
            return false;
        return this.probes[probeName].get(start, end, mode, interval);
    };

    DashboardsWorker.prototype.getTimeline = function(probesList, start, end) {
        if(typeof start === 'object')
            start = start.getTime();
        if(typeof end === 'object')
            end = end.getTime();

        if(!start && !end) {
            throw new ArgumentsError('You must specify a start or end time, or both.');
        }

        if(!probesList) {
            throw new ArgumentsError('Please provide a probes list.');
        }

        var fetch = false;
        for(var p in this.probes)
            fetch = (this.probes[p].checkNeedFetch(start, end) || fetch);
        if(fetch) {
            this.fetch(probesList, start, end);
            return false;
        }
        else {
            return this.get(probesList, start, end);
        }
    };

    DashboardsWorker.prototype.checkAggregate = function(probesList, previousRange, nextRange, mode) {
        var results = false, result = false, stacks = false;
        var step, probe;
        for(var i in probesList) {
            var curProbe = probesList[i];
            if(curProbe.stacked) {
                stacks = stacks || {};
                stacks[curProbe.scale] = stacks[curProbe.scale] || [];
                stacks[curProbe.scale].push(i);
            }
            else {
                step = this.probes[i].getStep() * 2;
                if(this.probes[i].checkAggregate(previousRange, [nextRange[0] - step, nextRange[1] + step])) {
                    result = this.probes[i].get(nextRange[0] - step, nextRange[1] + step, mode);
                    results = results || {};
                    results[i] = result;
                }
            }
        }

        // work with stacked probes
        if(stacks) {
            for(var s in stacks) {
                var curStack = stacks[s];
                var values = {};
                var check = false;
                var probeName;
                for(probeName in curStack) {
                    probe = this.probes[curStack[probeName]];
                    step = probe.getStep() * 2;
                    if(probe.checkAggregate(previousRange, [nextRange[0] - step, nextRange[1] + step]))
                        check = true;
                }

                if(check) {
                    results = results || {};
                    for(probeName in curStack) {
                        probe = curStack[probeName];
                        values[probe] = this.getProbe(probe, nextRange[0], nextRange[1], mode, 1);
                    }
                    var aggregate = this.aggregateStack(values, mode);
                    for(var a in aggregate)
                        results[a] = aggregate[a];
                }
            }
        }

        return results;
    };

    DashboardsWorker.prototype.getCursor = function(targetTime) {
        var results = {};
        for(var p in this.probes)
            results[p] = this.probes[p].getCursor(targetTime);
        return results;
    };

    DashboardsWorker.prototype.trigger = function(eventName, data) {
        this._server.trigger(eventName, data);
    };

    return DashboardsWorker;
});