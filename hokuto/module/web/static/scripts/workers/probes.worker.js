"use strict";
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

/**
 * Worker used to store, aggregate and manage probes Data for the Dashboard
 * @prop {String} BASE_URL - URL to be used on each request by @._request
 */
var BASE_URL = false;

/**
 * AJAX request handler
 * @function
 * @param {String} service    - Target part of the request URL
 * @param data                - Request params
 * @param {Function} callback - Function to be called on success
 */
var _request = function(service,data,callback){
    var xhr = new XMLHttpRequest();
    if(data && typeof data !== 'string'){
        if(data instanceof Object){
            var tmp = [];
            for(var d in data)
                tmp.push(d+'='+JSON.stringify(data[d]));
            data = tmp.join('&');
        }else if(data)
            data = JSON.stringify(data);
    }
    if(data)
        xhr.open('GET',BASE_URL.concat(service,'?',data),true);
    else
        xhr.open('GET',BASE_URL.concat(service),true);

    xhr.onreadystatechange = function(aEvt){
        if(xhr.readyState === 4){
            if(xhr.status === 200)
                callback(JSON.parse(xhr.response));
            else
                postMessage([9001,"Error on _request ".concat(service).concat(" with status ",xhr.status)]);
        }
    };
    xhr.send(null);
    return true;
};

/**
 * Probe class
 * @class
 * @prop {Number} _lastKnownFromDate      - The first received data date timestamp
 * @prop {Number} _lastKnownUntilDate     - The last received data date timestamp
 * @prop {Number} _lastRequestedFromDate  - The first requested date timestamp
 * @prop {Number} _lastRequestedUntilDate - The last requested date timestamp
 * @prop {Number} _interval               - The check interval in livestatus unit (1 = 60s)
 * @prop {Number} _step                   - The duration between two values (see @._data).
 * @prop {Array} _data                    - Array of values returned by the server.
 * @prop {Object} _predicted              - Predicted data for this probe
 * @prop {Object} _cache                  - Store @.getCursor() requests results.
 */
var Probe = function(){
    this._lastKnownFromDate = false;
    this._lastKnownUntilDate = false;
    this._lastRequestedFromDate = false;
    this._lastRequestedUntilDate = false;
    this._interval = false;
    this._step = false;
    this._data = [];
    this._predicted = false;
    this._cache = {};
    return this;
};

/**
 * Check if this probe need to be re-aggregated
 * @param {Array} context - Array of first and last timestamp of the current timeline
 * @param {Array} focus   - Array of first and last timestamp of the new focused timeline
 * @return true if a new aggregation is required
 */
Probe.prototype.checkAggregate = function(context,focus){
    var contextInterval = this._getAggregateLevel(context[0],context[1]);
    var focusInterval = this._getAggregateLevel(focus[0],focus[1]);
    if(contextInterval === focusInterval && focus[0] >= context[0] && focus[1] <= context[1]) return false;
    return true;
};

/**
 * Get data from this probe
 * @param {Number|Date} from  - Requested timeline start date
 * @param {Number|Date} until - Requested timeline end date
 * @param {String} mode       - Aggregation mode (max|min|avg)
 * @param {Number} [interval] - if given will take this value as aggregation level (1 will return all data)
 * @return {Object} Formated data
 */
Probe.prototype.get = function(from,until,mode,interval){
    if(from instanceof Date) from = from.getTime();
    if(until instanceof Date) until = until.getTime();
    var start = from || this._lastKnownFromDate;
    var end = until || this._lastKnownUntilDate;

    var data = this._aggregate(start,end,mode,interval);

    return data;
};

/**
 * Return the current probe values range (min/max)
 * @param {Array} [data] - If given will return value range for the given dataset.
 * @return [min, max]
 */
Probe.prototype.getRange = function(data){
    var min = false, max = false, data = data || this._data;
    for(var d in data){
        if(min.constructor === Boolean || min > data[d]) min = data[d] || 0;
        if(max.constructor === Boolean || max < data[d]) max = data[d] || 0;
    }
    return [min, max];
};

/**
 * Return the known value if any at the given date
 * @prop {Number} date - The date timestamp (in ms)
 */
Probe.prototype.getCursor = function(date){
    var result = false;
    var data = this._data;
    var start = this._lastKnownFromDate;
    var end = this._lastKnownUntilDate;
    var step = this._step;

    if(!!this._cache[date] && this._cache[date])
        return this._cache[date];

    if(data){
        if(date >= start && date <= end){
            var time = date - start;
            var offset = Math.round(time/step);
            result = data[offset] || 0;
        }else if(this._predicted && date >= this._predicted.start && date <= this._predicted.end){
            var time = date - this._predicted.start;
            var offset = (this._predicted.step) ? Math.round(time/this._predicted.step) : 0;
            if(!this._predicted.values[offset]) offset = this._predicted.values.length - 1;
            result = this._predicted.values[offset].value;
        }
        this._cache[date] = result;
    }else
        postMessage([9001,"Trying to get data from an undefined or empty probe : "+probe]);
    return result;
};

/**
 * Get interval
 */
Probe.prototype.getInterval = function(){
    return this._interval || 1;
};

/**
 * Set the interval rate
 */
Probe.prototype.setInterval = function(interval){
    this._interval = interval;
};

/**
 * Used by _parseData, update known values range when new data have been received
 * @param {Number|Date} start
 * @param {Number|Date} end
 */
Probe.prototype.setKnownDate = function(start,end){
    if(typeof start === 'object')
        start = start.getTime();
    if(typeof end === 'object')
        end = end.getTime();

    //update from values
    //if(!this._lastKnownFromDate || start < this._lastKnownFromDate)
    this._lastKnownFromDate = start;

    //update until values
    //if(!this._lastKnownUntilDate || end > this._lastKnownUntilDate)
    this._lastKnownUntilDate = end;

    this.setRequestedDate(start,end);
};

/**
 * Update previously made request date range to prevent useless request
 * @param {Number|Date} start
 * @param {Number|Date} end
 */
Probe.prototype.setRequestedDate = function(start,end){
    if(start){
        if(typeof start === 'object')
            start = start.getTime();
        //update from values
        if(!this._lastRequestedFromDate || start < this._lastRequestedFromDate)
            this._lastRequestedFromDate = start;
    }

    if(end){
        if(typeof end === 'object')
            end = end.getTime();
        //update until values
        if(!this._lastRequestedUntilDate || end > this._lastRequestedUntilDate)
            this._lastRequestedUntilDate = end;
    }
};

/**
 * Set predicted data
 * @param {Object} data - Object returned by the server (without formating)
 */
Probe.prototype.setPredicted = function(data){
    if(!!data.values){
        var formated = {};
        var values = [];
        for(var v in data.values){
            values.push({
                'date': Number(v),
                'value': data.values[v][2]
            });
        }
        formated.values = values;
        if(values[1])
            formated.step = (values[1].date - values[0].date) * 1000;
        if(values.length){
            formated.start = new Date(values[0].date * 1000);
            formated.end = new Date(values[values.length - 1].date * 1000);
            this._predicted = formated;
        }
    }
};

/**
 * Check if we need to request the server for the given timeline
 * @param {Number} from
 * @param {Number} until
 * @return true if a new fetch request is required for this probe
 */
Probe.prototype.checkNeedFetch = function(from,until){
    var check = false;
    if(from && from < this._lastRequestedFromDate)
        check = true;
    if(until && until > this._lastRequestedUntilDate)
        check = true;
    return check;
};

/**
 * Update probe data
 * @param {Array} data   - Probe's data
 * @param {Number} start - Start timestamp
 * @param {Number} end   - End timestamp
 * @param {Number} step  - step time value
 */
Probe.prototype.update = function(data,start,end,step){
    if(start >= this._lastKnownFromDate && end <= this._lastKnownUntilDate) return;
    if(!this._lastKnownFromDate ||(start <= this._lastKnownFromDate && end >= this._lastKnownUntilDate)){
        this.setData(data);
        this.setKnownDate(start, end);
        this.setStep(step);
        return;
    }

    //flatten data before any operation
    var currentData = this._data;
    var newData = data;
    var resultData = [];
    if(step > this.getStep()){
        var tmp = [];
        var interval = Math.ceil(step / this.getStep());
        for(var i = 0, len = currentData.length; i<len; i+=interval){
            var val = 0;
            for(var v=0;v<interval;v++){
                if(typeof currentData[i+v] === 'undefined') break;
                val += currentData[i+v] / interval;
            }
            tmp.push(val);
        }
        currentData = tmp;
    }else if(step < this.getStep()){
        var tmp = [];
        var interval = Math.ceil(this.getStep() / step);
        for(var i = 0, len = newData.length; i<len; i+=interval){
            var val = 0;
            for(var v=0;v<interval;v++){
                if(typeof newData[i+v] === 'undefined') break;
                val += newData[i+v] / interval;
            }
            tmp.push(val);
        }
        newData = tmp;
        step = this.getStep();
    }

    //build the new dataset
    if(start <= this._lastKnownFromDate){
        if(end !== this._lastKnownFromDate){
            if(end > this._lastKnownFromDate){
                var diff = Math.ceil((end - this._lastKnownFromDate) / step);
                while(--diff) newData.pop();
            }else{
                var diff = Math.ceil((this._lastKnownFromDate - end) / step);
                while(--diff) newData.push(null);
            }
        }
        resultData = newData.concat(currentData);
        var end = this._lastKnownUntilDate;
    }
    else{
        if(start !== this._lastKnownUntilDate){
            if(start < this._lastKnownUntilDate){
                var diff = Math.ceil((this._lastKnownUntilDate - start) / step);
                while(--diff) newData.shift();
            }else{
                var diff = Math.ceil((start - this._lastKnownFromDate) / step);
                while(--diff) newData = [null].concat(newData);
            }
        }
        resultData = currentData.concat(newData);
        var start = this._lastKnownFromDate;
    }

    this.setData(resultData);
    this.setKnownDate(start, end);
    this.setStep(step);
};

/**
 * Setter for @._data
 */
Probe.prototype.setData = function(data){
    this._data = data;
    return this;
};

/**
 * Setter for @._step
 */
Probe.prototype.setStep = function(step){
    this._step = step;
    return this;
};

/**
 * Getter for @.step
 */
Probe.prototype.getStep = function(){
    return this._step || 60000;
};

/**
 * Aggregate values
 * @param {Number} from       - Start of the timeline we want to aggregate
 * @param {Number} until      - End of the timeline we want to aggregate
 * @param {String} [mode]     - Aggregation mode (max|min|avg)
 * @param {Number} [interval] - If given will force this aggregation level.
 * @return Formated and aggregated data
 */
Probe.prototype._aggregate = function(from,until,mode,interval){
    var mode = mode || 'max';
    var data = this._data;
    var step = this._step;
    var interval = interval || this._getAggregateLevel(from,until);
    var start = (from < this._lastKnownFromDate) ? this._lastKnownFromDate : from;

    var tmp = [], time = this._lastKnownFromDate, s = false;
    for(var i = 0, len = data.length;i<len;i+=interval,time+= interval * step){
        if(time<from)
            continue;
        if(time>until)
            break;
        var avg = 0, isNull = true;

        if(mode === 'min')
            avg = data[i] || 0;

        for(var j = 0;j<interval;j++){
            if(typeof data[i+j] !== "object"){
                isNull = false;
                if(mode === 'max'){
                    if(data[i+j] > avg)
                        avg = data[i+j];
                }else if(mode === 'min'){
                    if(data[i+j] < avg)
                        avg = data[i+j];
                }else{
                    avg += data[i+j];
                }
            }
        }

        if(mode === 'avg')
            avg /= interval;

        if(isNull && s)
            continue;

        if(isNaN(avg)){
            postMessage([0,"NaN spotted on basic probe."]);
            continue;
        }

        tmp.push({
            'y': avg,
            'x': new Date(time + (interval * step / 2)),
            'y0': 0,
            'start': s
        });
        if(s)
            s = false;
        else if(isNull)
            s = true;
    };

    return {
        'values': tmp,
        'start': from,
        'end': until,
        'range': this.getRange(data)
    };
};

/**
 * Return the aggregationLevel at the given timeline
 * @param {Number} from  - Start of the timeline
 * @param {Number} until - End of the timeline
 */
Probe.prototype._getAggregateLevel = function(from,until){
    var step = this._step;
    var start = (from < this._lastKnownFromDate) ? this._lastKnownFromDate : from;
    var length = (until - start) / step;
    var interval = 1;
    if(length > 100)
        while(length/(interval*=2) > 100)
            ;
    return interval;
};


/**
 * Log class
 * @class
 * @prop {Array} _logs        - store received logs
 * @prop {Number} _knownFrom  - Known timeline start
 * @prop {Number} _knownUntil - Known timeline end
 */
var Log = function(){
    this._logs = [];
    this._knownFrom = false;
    this._knownUntil = false;
    return this;
};

/**
 * Return stored logs from the given timeline
 * @param {Number} from  - Start of the requested timeline
 * @param {Number} until - End of the requested timeline
 */
Log.prototype.getLogs = function(from,until){
    if(!from || from < this._knownFrom) from = this._knownFrom;
    if(!until || until > this._knownUntil) until = this._knownUntil;
    var results = [];

    for(var i=0, len = this._logs.length;i<len;i++){
        if(this._logs[i].time > until)
            break;
        if(this._logs[i].time < from)
            continue;
        results.push(this._logs[i]);
    }

    return results;
};

/**
 * Format and store logs data
 * @param {Object} data - Logs data returned by the server
 */
Log.prototype.setData = function(data){
    if(!data.results.length)
        return;
    this._logs = data.results;
    for(var i=this._logs.length;i;)
        this._logs[--i].time *= 1000;

    if(!this._knownFrom || this._logs[0].time < this._knownFrom)
        this._knownFrom = this._logs[0].time;
    if(!this._knownUntil || this._logs[this._logs.length - 1].time > this._knownUntil)
        this._knownUntil = this._logs[this._logs.length - 1].time;

    return this;
};


/**
 * Data class
 * @class
 * @static
 * @property {Object} probes - Store @Probe instances
 * @property {Object} logs   - Store @Log instances
 */
var Data = {
    probes: {},
    logs: {},

    /**
     * Add a new probe
     * @param {Array} data - [{String} probe name, {Number} check interval]
     */
    addProbe: function(data){
        var probe = data[0];
        var interval = data[1];
        if(typeof probe !== 'string'){
            postMessage([9001,"Failed to add probe, argument must be a string "+(typeof probe)+" given."]);
            return false;
        }
        if(!this.probes[probe]){
            this.probes[probe] = new Probe();
            this.probes[probe].setInterval(interval);
            var d = probe.split('.');
            if(d.length > 1){
                var h = d[0], s = d[1];
                this.logs[h] = this.logs[h] || {};
                if(!this.logs[h][s])
                    this.logs[h][s] = new Log();
            }
        }
        return this;
    },

    /**
     * Check if some probe have reached a new aggregate level
     * @param {Object} data
     *        {Object} data.probes          - probes data
     *        {Array}  data.contextTimeline - Current timeline
     *        {Array}  data.focusTimeline   - new timeline
     * @param {Number} sig                  - Caller ID
     * @return false if no probe have reached a new aggregate level, new probes aggregated data eitherway
     */
    checkAggregate: function(data,sig){
        var results = false, result = false, stacks = false;
        for(var p in data.probes){
            if(data.probes[p].stacked){
                stacks = stacks || {};
                stacks[data.probes[p].scale] = stacks[data.probes[p].scale] || [];
                stacks[data.probes[p].scale].push(p);
                continue;
            }
            var step = this.probes[p].getStep() * 2;
            if(this.probes[p].checkAggregate(data.contextTimeline, [data.focusTimeline[0] - step, data.focusTimeline[1] + step])){
                result = this.probes[p].get(data.focusTimeline[0] - step,data.focusTimeline[1] + step, data.mode);
                results = results || {};
                results[p] = result;
            }
        }

        //work with stacked probes
        if(stacks){
            for(var s in stacks){
                var values = {};
                var check = false;
                for(var p in stacks[s]){
                    var probe = this.probes[stacks[s][p]];
                    var step = probe.getStep() * 2;
                    if(probe.checkAggregate(data.contextTimeline, [data.focusTimeline[0] - step, data.focusTimeline[1] + step]))
                        check = true;
                }

                if(check){
                    results = results || {};
                    for(var p in stacks[s]){
                        var probe = stacks[s][p];
                        values[probe] = this.getProbe(probe, data.focusTimeline[0], data.focusTimeline[1], data.mode, 1);
                    }
                    var aggregate = this.aggregateStack(values, data.mode);
                    for(var a in aggregate)
                        results[a] = aggregate[a];
                }
            }
        }

        return results;
    },

    /**
     * Return data from query
     * @param {Object} query - Request details
     *                 query.probes: [probename,probename,probename,...]
     *                 query.start: timestamp
     *                 query.end: timestamp
     * @param {Number} signature - Requester ID
     */
    get: function(query,signature){
        if(!query)
            return false;
        if(typeof query === "string")
            return this.getProbe(query);
        else if(typeof query === 'object'){
            var results = {};
            var stacks = {};

            var mode = query['mode'] || 'max';
            if(query.start && query.start.constructor === Date)
                query.start = query.start.getTime();
            if(query.end && query.end.constructor === Date)
                query.end = query.end.getTime();
            for(var p in query.probes){
                if(query.probes[p].stacked){
                    stacks[query.probes[p].scale] = stacks[query.probes[p].scale] || [];
                    stacks[query.probes[p].scale].push(p);
                    continue;
                }
                var data = this.getProbe(p,query['start'],query['end'],mode);
                if(data)
                    results[p] = data;
            }


            //get stacked data
            for(var s in stacks){
                var values = {};
                for(var p in stacks[s]){
                    values[stacks[s][p]] = this.getProbe(stacks[s][p],query['start'],query['end'],mode,1);
                }

                //aggregate theme
                var aggregate = this.aggregateStack(values,mode);
                for(var s in aggregate){
                    results[s] = aggregate[s];
                }
            }

            postMessage([6,results,signature]);
            var logs = this.getLogs(query);
            if(logs)
                postMessage([10,logs,signature]);
            return results;
        }
        return false;
    },

    /**
     * Aggregation rules for stacked probes
     * @param {Object} stack - Current stack's probes data
     * @param {String} mode  - Aggregation mode (max|min|avg)
     * @return Aggregated stack
     */
    aggregateStack: function(stack,mode){
        var results = {};

        var getInterpolated = function(time,previous,next){
            var diff = next.y - previous.y;
            var percent = (next.x - previous.x) / 100;
            percent = (time - previous.x) / percent;
            return (previous.y + percent / 100 * diff);
        };

        for(var p in stack){
            var probe = stack[p];
            var interval = this.probes[p]._getAggregateLevel(probe.start,probe.end);
            var step = this.probes[p].getStep();
            var newValues = [];
            var cached = {};

            for(var i = 0, len = probe.values.length; i<len; i+=interval){
                var previous = false;
                var newValue = 0;

                for(var j = 0; j<interval;j++){
                    //get others values
                    if(typeof probe.values[i+j] === 'undefined') continue;
                    var time = probe.values[i+j].x;
                    var value = probe.values[i+j].y;
                    for(var q in stack){
                        if(q === p) continue;
                        for(var k = cached[q] || 0, len = stack[q].values.length; k < len; k++){
                            var tmp = stack[q].values[k];
                            if(tmp.x.getTime() < time.getTime()) continue;
                            if(tmp.x.getTime() === time.getTime())
                                value += tmp.y;
                            else
                                value += (stack[q].values[k - 1]) ? getInterpolated(time,stack[q].values[k - 1],stack[q].values[k]) : 0;
                            cached[q] = k;
                            break;
                        }
                    }
                    if(mode === 'max'){
                        if(previous <= value){
                            previous = value;
                            newValue = probe.values[i+j].y;
                        }
                    }else if(mode === 'min'){
                        if(typeof previous === 'boolean' || previous > value){
                            previous = value;
                            newValue = probe.values[i+j].y;
                        }
                    }else{
                        newValue += (probe.values[i+j].y - newValue) / (j + 1);
                    }
                    if(!probe.values[i+j+1]) break;
                }

                if(isNaN(newValue)){
                    postMessage([0,"NaN spotted on stacked probe!"]);
                    continue;
                }

                if(!probe.values[i]) continue;
                newValues.push({
                    'y': newValue,
                    'x': new Date(probe.values[i].x.getTime() + interval * step / 2),
                    'start': false,
                    'y0': 0
                });
            }
            results[p] = {
                'values': newValues,
                'start': probe.start,
                'end': probe.end,
                'range': probe.range
            }
        }

        return results;
    },

    /**
     * Return the probe stored data.
     * @param {String} probe      - The probe name
     * @param {Number} [from]     - Start of the requested timeline
     * @param {Number} [until]    - End of the requested timeline
     * @param {String} [mode]     - Aggregation mode
     * @param {Number} [interval] - Force aggregation level
     */
    getProbe: function(probe,from,until,mode,interval){
        if(!this.probes[probe]) return false;
        return this.probes[probe].get(from,until,mode,interval);
    },

    /**
     * Return logs
     * @param {Object} data - Request data
     *                 data.probes: probes list
     *                 data.start: request timerange start
     *                 data.end: request timerange end
     * @param {Number} sig - Requester ID
     */
    getLogs: function(data,sig){
        var probes = data['probes'];
        var results = {};
        var h,s,d;
        for(var p in probes){
            d= p.split('.'), h=d[0], s=d[1];
            if(!s || !h) continue;
            var logs = this.logs[h][s].getLogs(data['start'],data['end']);
            if(!logs.length)
                continue;
            if(!results[h])
                results[h] = {};
            if(results[h][s])
                continue;
            results[h][s] = logs;
        }
        if(!Object.keys(results).length)
            return false;
        return results;
    },

    /**
     * Get value from all probes at the given date
     * @param {Number} date - date timestamp
     */
    getCursor: function(date){
        var results = {};
        for(var p in this.probes)
            results[p] = this.probes[p].getCursor(date);
        return results;
    },

    /**
     * get data for given probes
     * will fetch new data if needed
     * @param {Object} data
     *                 data.start
     *                 data.end
     *                 data.probes
     * @param {Number} signature - Requester ID
     */
    getTimeline: function(data,signature){
        if(typeof data['start'] === 'object')
            data['start'] = data['start'].getTime();
        if(typeof data['end'] === 'object')
            data['end'] = data['end'].getTime();

        var probes = data.probes;
        var start = data['start'];
        var end = data['end'];
        if((!start && !end) || !probes){
            postMessage([9001,"Can't update fromDate, missing parameters"]);
            return false;
        }

        var fetch = false;
        for(var p in this.probes)
            var fetch = (this.probes[p].checkNeedFetch(start,end) || fetch);
        if(fetch)
            this.fetch(data,signature);
        else
            this.get(data,signature);

        return fetch;
    },

    /**
     * Fetch and return data from given probes
     * @param {Object} q - Request details
     * @param {Number} signature - Requester ID
     */
    fetch: function(q,signature){
        //TODO: fetch only probes and log at the given timeline
        var probes = q.probes || Object.keys(this.probes), details = [];
        if(!Array.isArray(probes)) probes = Object.keys(probes);
        for(var i=0,len = probes.length;i<len;i++){
            var start = false, end = false;
            if(!!q && q['start'])
                start = q['start'];
            if(!!q && q['end'])
                end = q['end'];
            if(start || end)
                this.probes[probes[i]].setRequestedDate(start,end);
            details = probes[i].split('.');

            if(!!this.logs[details[0]] && !!this.logs[details[0]][details[1]])
                this.fetchLog(details[0],details[1], signature, start, end);
        }

        var query = {'probes': probes };
        if(!!q && q['start'])
            query['from'] = Math.floor(q['start'] / 1000);
        if(!!q && q['end'])
            query['until'] = Math.floor(q['end'] / 1000);

        _request('/services/data/get/', query, function(data){
            if(data){
                postMessage([1,data,signature]);
                this._parseResponseData(data);
                //need to return if the redraw is required, maybe the return from parseResponse?
            }
        }.bind(this));

        //fetch query if possible
        this.fetchPredicts(probes,signature)

        return this;
    },

    /**
     * TODO: Fetch one probe
     */
    fetchProbe: function(probe){
        //TODO
        return this;
    },

    /**
     * Fetch log data
     * @param {String} host    - Host name
     * @param {String} service - Service name
     * @param {Number} sig     - Requester ID
     * @param {Number} start   - Start date timestamp
     * @param {Number} end     - end date timestamp
     */
    fetchLog: function(host,service,sig,start,end){
        if(start) start /= 1000;
        if(end) end /= 1000;
        if(!this.logs[host][service].getLogs().length){
            var url = '/services/livestatus/get/service/logs/'+host+'/'+service+'/';
            var data = { 'start': start, 'end': end};
            _request(url,data,function(logs){
                this.logs[host][service].setData(logs);
                var results = {};
                results[host] = {};
                results[host][service] = this.logs[host][service].getLogs();
                postMessage([10,results,sig]);
            }.bind(this));
        }else{
            var results = {};
            results[host] = {};
            results[host][service] = this.logs[host][service].getLogs();
            postMessage([10,results,sig]);
        }
        return;
    },

    /**
     * Fetch predict data if any
     * TODO: need to be able to disable this
     * @param {Array} probes - Probes names
     * @param {Number} sig   - Requester ID
     */
    fetchPredicts: function(probes,sig){
        //TODO check if predict data already fetched to prevent useless requests
        var url = '/services/predict/forecast';
        var query = { 'probes': probes};
        _request(url, query, function(data){
            postMessage([11,data,sig]);
            for(var p in data)
                this.probes[p].setPredicted(data[p]);
        }.bind(this));
    },

    /**
     * Handle the response object by converting timestamp to ms and construct the data object.
     */
    _parseResponseData: function(response){
        for(var d in response){
            //TODO: should handle errors messages and code
            if(!response[d].values) continue;
            response[d].start *= 1000;
            response[d].end *= 1000;
            response[d].step *= 1000;

            var time = response[d].start;
            var step = response[d].step;
            var tmp = [];
            var start = true;
            var query = d.split('.');
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
    }
};

/**
 * Control room
 */
onmessage = function(m){
    if(typeof m.data === 'string'){
        postMessage("Hay!");
        return false;
    }
    if(typeof m.data !== 'object' || (!m.length && m.length < 2)){
        consxole.log('Passed object must be an array of two or more values!');
        return false;
    }

    var data = m.data[1];
    var sig = m.data[2];
    /*
      1: set baseURL for ajax requests
      2: add probe
      3: fetch data
      4: fetch single probe data
      5: fetch single log data
      6: get data (will return also timeline and min/max available)
      7: update timeline
      8: check if new aggregation scale reached with given timeline.
      9: Get cursor data
      10: Get logs data
      11: Delete part
    */
    switch(m.data[0]){
    case 1:
        BASE_URL = data;
        break;
    case 2:
        Data.addProbe(data);
        break;
    case 3:
        Data.fetch(data,sig);
        break;
    case 4:
        //TODO: not functional yet
        Data.fetchProbe(data);
        break;
    case 5:
        Data.fetchLog(data);
        break;
    case 6:
        Data.get(data,sig);
        break;
    case 7:
        if(!data.start && !data.end)
            return false;
        if(Data.getTimeline(data,sig))
            postMessage([0,"New fromDate require to fetch new data"]);
        break;
    case 8:
        var aggregate = Data.checkAggregate(data,sig);
        if(aggregate)
            postMessage([8,aggregate,sig]);
        break;
    case 9:
        var results = Data.getCursor(data);
        postMessage([9,{
            'values':results,
            'date': data
        }]);
        break;
    case 10:
        var logs = Data.getLogs(data,sig);
        if(logs)
            postMessage([10,logs]);
        break;
    default:
        postMessage("Errrr dunno what to do with this crap or forgot to set a break statement. "+m.data[0])
    }
};
