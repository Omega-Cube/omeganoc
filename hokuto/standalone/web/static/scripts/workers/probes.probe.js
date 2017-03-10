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

define(['console', 'argumenterror'], function(Console, ArgumentError) {
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
    Probe.prototype.get = function(from, until, mode, interval){
        if(from instanceof Date) from = from.getTime();
        if(until instanceof Date) until = until.getTime();
        var start = from || this._lastKnownFromDate;
        var end = until || this._lastKnownUntilDate;

        var data = this._aggregate(start, end, mode, interval);

        return data;
    };

    /**
     * Return the current probe values range (min/max)
     * @param {Array} [data] - If given will return value range for the given dataset.
     * @return [min, max]
     */
    Probe.prototype.getRange = function(data){
        var min = false, max = false;
        data = data || this._data;
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

        if(data) {
            if(date >= start && date <= end) {
                var time = date - start;
                var offset = Math.round(time / step);
                result = data[offset] || 0;
            }
            else if(this._predicted && date >= this._predicted.start && date <= this._predicted.end) {
                var futureTime = date - this._predicted.start;
                var futureOffset = (this._predicted.step) ? Math.round(futureTime / this._predicted.step) : 0;
                if(!this._predicted.values[futureOffset]) {
                    futureOffset = this._predicted.values.length - 1;
                }
                result = this._predicted.values[futureOffset].value;
            }
            this._cache[date] = result;
        }
        else {
            throw new ArgumentError('Trying to get data from an undefined or empty probe');
        }
        return result;
    };

    /**
     * Get interval
     */
    Probe.prototype.getInterval = function() {
        return this._interval || 1;
    };

    /**
     * Set the interval rate
     */
    Probe.prototype.setInterval = function(interval) {
        this._interval = interval;
    };

    /**
     * Used by _parseData, update known values range when new data have been received
     * @param {Number|Date} start
     * @param {Number|Date} end
     */
    Probe.prototype.setKnownDate = function(start, end) {
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

        this.setRequestedDate(start, end);
    };

    /**
     * Update previously made request date range to prevent useless request
     * @param {Number|Date} start
     * @param {Number|Date} end
     */
    Probe.prototype.setRequestedDate = function(start, end){
        if(start) {
            if(typeof start === 'object')
                start = start.getTime();
            //update from values
            if(!this._lastRequestedFromDate || start < this._lastRequestedFromDate)
                this._lastRequestedFromDate = start;
        }

        if(end) {
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
    Probe.prototype.setPredicted = function(data) {
        if(!data) { 
            return;
        }
        if(data.values) {
            var formated = {};
            var values = [];
            for(var v in data.values) {
                values.push({
                    'date': Number(v),
                    'value': data.values[v][2]
                });
            }
            formated.values = values;
            if(values[1])
                formated.step = (values[1].date - values[0].date) * 1000;
            if(values.length) {
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
    Probe.prototype.checkNeedFetch = function(from, until){
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
    Probe.prototype.update = function(data,start,end,step) {
        if(start >= this._lastKnownFromDate && end <= this._lastKnownUntilDate) return;
        if(!this._lastKnownFromDate ||(start <= this._lastKnownFromDate && end >= this._lastKnownUntilDate)) {
            this.setData(data);
            this.setKnownDate(start, end);
            this.setStep(step);
            return;
        }

        //flatten data before any operation
        var currentData = this._data;
        var newData = data;
        var resultData = [];
        var tmp = [];
        var interval = 0;
        var i, len, val, v;
        if(step > this.getStep()) {
            tmp = [];
            interval = Math.ceil(step / this.getStep());
            for(i = 0, len = currentData.length; i<len; i+=interval) {
                val = 0;
                for(v = 0; v < interval; v++) {
                    if(typeof currentData[i+v] === 'undefined') break;
                    val += currentData[i+v] / interval;
                }
                tmp.push(val);
            }
            currentData = tmp;
        } 
        else if(step < this.getStep()) {
            tmp = [];
            interval = Math.ceil(this.getStep() / step);
            for(i = 0, len = newData.length; i<len; i+=interval) {
                val = 0;
                for(v = 0; v < interval; v++) {
                    if(typeof newData[i+v] === 'undefined') break;
                    val += newData[i+v] / interval;
                }
                tmp.push(val);
            }
            newData = tmp;
            step = this.getStep();
        }

        //build the new dataset
        var diff;
        if(start <= this._lastKnownFromDate) {
            if(end !== this._lastKnownFromDate) {
                if(end > this._lastKnownFromDate) {
                    diff = Math.ceil((end - this._lastKnownFromDate) / step);
                    while(--diff) newData.pop();
                }
                else {
                    diff = Math.ceil((this._lastKnownFromDate - end) / step);
                    while(--diff) newData.push(null);
                }
            }
            resultData = newData.concat(currentData);
            end = this._lastKnownUntilDate;
        }
        else {
            if(start !== this._lastKnownUntilDate) {
                if(start < this._lastKnownUntilDate) {
                    diff = Math.ceil((this._lastKnownUntilDate - start) / step);
                    while(--diff) newData.shift();
                }
                else {
                    diff = Math.ceil((start - this._lastKnownFromDate) / step);
                    while(--diff) newData = [null].concat(newData);
                }
            }
            resultData = currentData.concat(newData);
            start = this._lastKnownFromDate;
        }

        this.setData(resultData);
        this.setKnownDate(start, end);
        this.setStep(step);
    };

    /**
     * Setter for @._data
     */
    Probe.prototype.setData = function(data) {
        this._data = data;
        return this;
    };

    /**
     * Setter for @._step
     */
    Probe.prototype.setStep = function(step) {
        this._step = step;
        return this;
    };

    /**
     * Getter for @.step
     */
    Probe.prototype.getStep = function() {
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
    Probe.prototype._aggregate = function(from, until, mode, interval) {
        mode = mode || 'max';
        interval = interval || this._getAggregateLevel(from,until);
        var data = this._data;
        var step = this._step;

        var tmp = [], time = this._lastKnownFromDate, s = true;
        for(var i = 0, len = data.length; i < len; i += interval, time += interval * step){
            if(time < from)
                continue;
            if(time > until)
                break;
            var avg = 0, isNull = true;

            if(mode === 'min')
                avg = data[i] || 0;

            for(var j = 0; j < interval; j++){
                if(typeof data[i+j] !== 'object'){
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

            if(isNaN(avg)) {
                Console.warn('NaN spotted on basic probe.');
                continue;
            }

            tmp.push({
                'y': avg,
                'x': new Date(time + (interval * step / 2)),
                'y0': 0,
                'start': s
            });
            if(s) {
                s = false;
            }
            else if(isNull) {
                s = true;
            }
        }

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
    Probe.prototype._getAggregateLevel = function(from, until) {
        var step = this._step;
        var start = (from < this._lastKnownFromDate) ? this._lastKnownFromDate : from;
        var length = (until - start) / step;
        var interval = 1;
        while(length / interval > 100) {
            interval *= 2;
        }
        return interval;
    };

    return Probe;
});