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
    'console', 
    'dataservice', 
    'metroservice',
    'onoc.createurl',
    'onoc.states',
    'onoc.config',
    'dashboards.worker'], function (jQuery, Console, DataService, MetroService, createUrl, States, Config, DashboardWorker) {

    function getInterpolatedValue(x, p, values){
        var result = 0;
        for(var v in values){
            if(values[v].x < x) 
                continue;
            if(!values[v-1] || x.getTime() === values[v].x.getTime()) {
                result = values[v].y;
            }
            else if(!values[v+1] && (x.getTime() > values[v].x.getTime())) {
                result = 0;
            }
            else {
                var diff = values[v].y - values[v-1].y;
                var percent = (values[v].x - values[v-1].x) / 100;
                percent = (x - values[v-1].x) / percent;
                result= values[v-1].y + percent / 100 * diff;
            }
            break;
        }

        return result;
    }

    function parseMetrics(list) {
        var r = [];
        for(var i in list) {
            if(typeof(list[i]) === 'object')
                r = r.concat(parseMetrics(list[i]));
            else
                r.push(list[i]);
        }
        return r;
    }


    /**
     * Manage probes data
     * @static
     * @property {Object} probes  - probes list
     * @property {Object} metrics - metrics list
     * @property {Worker} worker  - The worker is used for all aggregation and data management to save some CPU speed.
     */
    var DashboardProbes = {
        probes: {},
        metrics: false,
        worker: new DashboardWorker(),
        probesDoneLoadingCallbacks: [],

        /**
         * Add a new probe, will not fetch his data to allow the use of only one request with this.fetchAllData()
         * @param {String} probe - The probe identifer following the format [server]_[service]
         */
        addProbe: function(probe){
            var query = probe.split(Config.separator());
            var interval = States.getServicesStates(query[0],query[1]).check_interval || 1;
            this.worker.addProbe(probe, interval);
            if(!this.probes[probe])
                this.probes[probe] = [];
            return this;
        },

        /**
         * Create the stackedData object.
         * @param {Object} probes - Stack's probes list
         * @param {Object} data   - Probe's data
         */
        getStackedData: function(probes,data){
            var results = [];
            var previous = [];

            for(var p in probes){
                var entry = [];
                for(var d in data[p].values){
                    var y0 = 0;
                    for(var n in previous)
                        //retreive the imported value to calculate y0
                        y0 += getInterpolatedValue(data[p].values[d].x, data[previous[n]].values);

                    entry.push({
                        'x': data[p].values[d].x,
                        'y': data[p].values[d].y,
                        'y0': y0,
                        'name': p,
                        'color': probes[p].color,
                        'start': data[p].values[d].start
                    });
                }

                results.push(entry);
                previous.push(p);
            }
            return results;
        },

        /**
         * Return metrics
         * @param {String} query - If given will return metrics from this pattern.
         */
        getMetrics: function(query) {
            if(!query)
                return this.metrics;
            var splited = query.split(Config.separator());
            if(splited.length === 1)
                return query;
            var metrics = this.metrics;
            for(var split in splited) {
                if(splited[split] === '*')
                    break;
                metrics = metrics[splited[split]];
            }
            return metrics;
        },

        /**
         * Return an array of all available probes for the given query
         * @param {String} query - The search pattern
         */
        getProbeList: function(query) {
            var metrics = this.getMetrics(query);
            if(typeof(metrics) !== 'object')
                return [metrics];

            return parseMetrics(metrics);
        },

        /**
         * Remove a signature reference from listeners
         * @param { Integer } sig - Signature (part's ID) value
         */
        removeSignature : function(sig){
            for(var i in this.worker._listeners){
                for(var j in this.worker._listeners[i]){
                    if(this.worker._listeners[i][j][0] === sig)
                        this.worker._listeners[i].splice(j,1);
                }
            }
        },

        /**
         * Extract the host from a probe name
         * @param {string} probe - The full probe name
         * @return the host name
         */
        extractHost: function(probe){
            var host = probe.split(Config.separator())[0];
            return host;
        },

        /**
         * Extract the service from a probe name
         * @param {string} probe - The full probe name
         * @return the service description name
         */
        extractService: function(probe){
            var service = probe.split(Config.separator())[1];
            return service;
        },

        /**
         * Queues a callback that will be run as soon as possible,
         * but only after the probes manager received the probes data
         */
        onMetricsReady: function(callback) {
            if(this.probesDoneLoadingCallbacks === null) {
                // Metrics already loaded;
                // call the callback immediately
                callback(this.metrics);
            }
            else {
                // Metrics not available yet
                // Put the callback in a waiting line
                this.probesDoneLoadingCallbacks.push(callback);
            }
        },

        /**
         * Fetch all available metrics from the server
         * @param {Function} callback
         */
        _requestMetrics: function() {
            return MetroService.getMetricsList().then(function(response) {
                this.metrics = response;
                if(this.probesDoneLoadingCallbacks !== null) {
                    for(var i in this.probesDoneLoadingCallbacks) {
                        this.probesDoneLoadingCallbacks[i](response);
                    }
                    this.probesDoneLoadingCallbacks = null;
                }

                return response;
            }.bind(this));
        },
    };

    //TODO: GRUICK!
    DashboardProbes._requestMetrics();

    return DashboardProbes;
});
