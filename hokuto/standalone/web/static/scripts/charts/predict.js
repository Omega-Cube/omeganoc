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

define([], function(){

    /**
     * Predict class used to handle predict data.
     * For the moment only use forecasting predicted values
     * @property {Object} data - Data returned from the server.
     */
    var Predict = function(){
        this.data = {};
    };

    /**
     * Set new dataset, will replace old ones so be sure that every probes are included
     * TODO: Add an update method?
     * @param {Object} data - Data returned from the server
     */
    Predict.prototype.set = function(data){
        if(!Object.keys(data).length)
            return false;

        for(var p in data){
            if(!data[p])
                continue;
            data[p].date *= 1000;
            for(var v in data[p].values){
                var tmp = data[p].values[v];
                delete data[p].values[v];
                v*= 1000;
                data[p].values[v] = tmp;
            }
        }
        this.data = data;
    };

    /**
     * Return the first predicted date
     * @param {String} probe - The probe name.
     * @return {Number} date timestamp
     */
    Predict.prototype.first = function(probe){
        if(!this.data[probe])
            return false;
        return this.data[probe].date;
    };

    /**
     * Return the last predicted date.
     * @param {String} probe - Probe name.
     * @return {Number} date timestamp
     */
    Predict.prototype.last = function(probe){
        if(!this.data[probe])
            return false;
        var values = Object.keys(this.data[probe].values);
        if(!values.length)
            return false;
        var max = 0;
        for(var i =0, len = values.length;i<len;i++)
            if(Number(values[i]) > max)
                max = Number(values[i]);

        return max;
    };

    /**
     * Return the last predicted date for all probes.
     * @return {Number} date timestamp
     */
    Predict.prototype.getLastPredictedDate = function(){
        if(!Object.keys(this.data).length)
            return 0;
        var max = 0;
        for(var p in this.data){
            var last = this.last(p);
            if(last > max) max = last;
        }
        return last;
    };

    /**
     * Return predicted values for the given probe
     * @param {String} probe - The probe name
     * @param {Number} start - Start time, will return all value if not specified
     */
    Predict.prototype.getProbePredicts = function(probe,start){
        if(!this.data[probe])
            return false;
        start = start || new Date().getTime();
        var results = {};
        var values = this.data[probe].values;
        for(var v in values){
            if(Number(v) > start)
                results[v] = values[v];
        }

        //format results for drawing
        var formated = [];
        for(var i = 0, len = 5; i<len; i++){
            var tmp = [];
            for(v in results){
                tmp.push({
                    'x': Number(v),
                    'y': results[v][i]
                });
            }
            formated.push(tmp);
        }

        return formated;
    };

    /**
     * Return all predicted data
     * @param {Number} start - timestamp from which we want predict data
     */
    Predict.prototype.getAll = function(start){
        start = start || 0;
        var results = {};
        for(var p in this.data)
            results[p] = this.getProbePredicts(p,start);
        return results;
    };

    return Predict;
});
