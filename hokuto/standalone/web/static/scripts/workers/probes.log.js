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

define([], function() {
    /**
     * Log class
     * @class
     * @prop {Array} _logs        - store received logs
     * @prop {Number} _knownFrom  - Known timeline start
     * @prop {Number} _knownUntil - Known timeline end
     */
    var Log = function() {
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
    Log.prototype.getLogs = function(from, until) {
        if(!from || from < this._knownFrom) from = this._knownFrom;
        if(!until || until > this._knownUntil) until = this._knownUntil;
        var results = [];

        for(var i=0, len = this._logs.length;i<len;i++) {
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

    return Log;
});
