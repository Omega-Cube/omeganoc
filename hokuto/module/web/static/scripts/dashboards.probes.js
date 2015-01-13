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
define(['jquery', 'console', 'dataservice', 'onoc.createurl','onoc.states'], function (jQuery, Console, DataService, createUrl, States) {

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
        worker: new Worker("static/scripts/workers/probes.worker.js"),

        /**
         * Add a new probe, will not fetch his data to allow the use of only one request with this.fetchAllData()
         * @param {String} probe - The probe identifer following the format [server]_[service]
         */
        addProbe: function(probe){
            var query = probe.split('.');
            var interval = States.getServicesStates(query[0],query[1]).check_interval || 1;
            this.worker.postMessage([2,[probe,interval]]);
            if(!this.probes[probe])
                this.probes[probe] = [];
            return this;
        },

        /**
         * Remove a probe
         * @param {Number} parts_id - The part's id
         * @param {String} probe - Probe identifer (device-service)
         * @param {String} scale - Scale identifer
         */
        remove: function(parts_id,probe,scale){
            var req = {};
            if(probe) req['probe'] = probe;
            if(scale) req['scale'] = scale;
            this._removeProbe(parts_id,req);
        },

        /**
         * Create the stackedData object.
         * @param {Object} probes - Stack's probes list
         * @param {Object} data   - Probe's data
         */
        getStackedData: function(probes,data){
            var results = [];
            var previous = [];

            //retreive the imported value to calculate y0
            var getInterpolatedValue = function(x,p){
                var values = data[p].values;
                var result = 0;
                for(var v in values){
                    if(values[v].x < x) continue;
                    if(!values[v-1] || x.getTime() === values[v].x.getTime()){
                        result = values[v].y;
                    }else if(!values[v+1] && (x.getTime() > values[v].x.getTime())){
                        result = 0;
                    }else{
                        var diff = values[v].y - values[v-1].y;
                        var percent = (values[v].x - values[v-1].x) / 100;
                        percent = (x - values[v-1].x) / percent;
                        result= values[v-1].y + percent / 100 * diff;
                    }
                    break;
                }

                return result;
            }

            for(var p in probes){
                var entry = [];
                for(var d in data[p].values){
                    var y0 = 0;
                    for(var n in previous)
                        y0 += getInterpolatedValue(data[p].values[d].x,previous[n]);

                    entry.push({
                        'x': data[p].values[d].x,
                        'y': data[p].values[d].y,
                        'y0': y0,
                        'name': p,
                        'color': probes[p].color,
                        'start': data[p].values[d].start
                    });
                }

                var end = data[p].end;

                results.push(entry);
                previous.push(p);
            }
            return results;
        },

        /**
         * Return metrics
         * @param {String} query - If given will return metrics from this pattern.
         */
        getMetrics: function(query){
            if(!query)
                return this.metrics;
            var splited = query.split('.');
            if(splited.length === 1)
                return query;
            var metrics = this.metrics;
            for(var split in splited){
                if(splited[split] === '*')
                    break;
                metrics = metrics[splited[split]];
            };
            return metrics;
        },

        /**
         * Return an array of all available probes for the given query
         * @param {String} query - The search pattern
         */
        getProbeList: function(query){
            var metrics = this.getMetrics(query);
            if(typeof(metrics) !== 'object')
                return [metrics];

            var parse = function(list){
                var r = [];
                for(var i in list){
                    if(typeof(list[i]) === 'object')
                        r = r.concat(parse(list[i]))
                    else
                        r.push(list[i])
                }
                return r;
            }
            var results= parse(metrics);

            return results;
        },

        /**
         * Fetch all available metrics from the server
         * @param {Function} callback
         */
        _requestMetrics: function(callback){
            jQuery.getJSON(createUrl('/services/data/get/metrics/'),function(response){
                this.metrics = response;
                if(callback && typeof callback === 'function')
                    callback(this.metrics);
            }.bind(this));
        },

        /**
         * Send a DELETE request to remove a probe from a parts
         * @param {Number} parts_id
         * @param {Object} request - Request data
         * @param {Function} successCallback
         * @param {Function} errorCallback
         */
        _removeProbe: function(parts_id, request, successCallback, errorCallback){
            var url = createUrl('/dashboards/part/keys/delete/'+parts_id);
            $.ajax({
                url: url,
                type: 'DELETE',
                success: successCallback,
                error: errorCallback,
                dataType: 'json',
                data: request
            });
        },
    };

    //worker responses

    //build event list, use a function only to help readability and scaling
    (function(){
        var events = ['cursor','fetch','get','error','aggregate','timeline','logs','predict'];
        DashboardProbes.worker._listeners = [];
        DashboardProbes.worker._events = {};
        for(var i = events.length;i;)
            DashboardProbes.worker._events[events[--i]] = DashboardProbes.worker._listeners.push([]) - 1;
    }());

    /**
     * Worker custom event listener
     * @param {String} event      - event type
     * @param {Function} callback
     * @param {Number} signature  - Requester id (aka Part's id)
     */
    DashboardProbes.worker.on = function(event,callback,signature){
        if(typeof this._events[event] === 'undefined'){
            console.error("[WORKER] Can't listen to event "+event+", unknown.");
            return false;
        }
        this._listeners[this._events[event]].push([signature,callback]);
        return this._listeners.length - 1;
    };

    //onmessage event, aka workers control room
    DashboardProbes.worker.onmessage = function(m){
        if(m.data instanceof Array && m.data.length >= 2){
            var response = m.data[1], event = false;
            /**
             * 0: log/notification
             * 1: Received probes data
             * 6: Returned probes data
             * 8: Returned newly aggregated data
             * 9: Returned cursor data
             * 10: Returned logs data
             * 11: Returned predict data
             * 9001: error
             */
            switch(m.data[0]){
            case 0:
                console.log("[WORKER]",response);
                break;
            case 1:
                event = 'fetch';
                console.log("[WORKER] Got data from the server.",m.data);
                break;
            case 6:
                event = "get";
                console.log("[WORKER] Returned requested data.",m.data);
                break;
            case 8:
                event = "aggregate";
                break;
            case 9:
                event = "cursor";
                break;
            case 10:
                event = "logs";
                break;
            case 11:
                event = "predict";
                break;
            case 9001:
                event = "error";
                console.error("[WORKER]",response);
                break;
            default:
                event = "error";
                console.log("[WORKER] Unknown return code",m.data[0],response);
            }
            //execute listeners
            if(event && this._listeners[this._events[event]].length){
                var listener = this._listeners[this._events[event]];
                var sig = false, callback = false, l = false;
                for(var i = 0, len = listener.length;i<len;i++){
                    l = listener[i];
                    sig = l[0];
                    callback = l[1];
                    //check if the event require a valide signature
                    if(m.data[2] && m.data[2] !== sig)
                        continue;
                    callback(m.data[1]);
                }
            }
        }
    };
    //setup the BASE_URL for worker's requests
    DashboardProbes.worker.postMessage([1,$SCRIPT_ROOT]);

    //TODO: GRUICK!
    DashboardProbes._requestMetrics();

    return DashboardProbes;
});
