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

define(['console', 'workerclient'], function(Console, WorkerClient) {
    function args2array(args) {
        return Array.prototype.slice.call(args);
    }

    /**
     * This is a very straightforward proxy class, that redirects all method calls to an underlying worker.
     * The actual methods signatures can be found in the workers/probes.worker module
     */
    function DashboardWorker() {
        this._workerClient = new WorkerClient('workers/dashboards.worker');
    }

    DashboardWorker.prototype.addProbe = function() {
        return this._workerClient.call('addProbe', args2array(arguments));
    };

    DashboardWorker.prototype.fetch = function() {
        return this._workerClient.call('fetch', args2array(arguments));
    };

    DashboardWorker.prototype.get = function() {
        return this._workerClient.call('get', args2array(arguments));
    };

    DashboardWorker.prototype.getTimeline = function() {
        return this._workerClient.call('getTimeline', args2array(arguments));
    };

    DashboardWorker.prototype.checkAggregate = function() {
        return this._workerClient.call('checkAggregate', args2array(arguments));
    };

    DashboardWorker.prototype.getCursor = function() {
        return this._workerClient.call('getCursor', args2array(arguments));
    };

    DashboardWorker.prototype.on = function(eventName, callback) {
        // TODO: check the the eventName matches a known event ?
        this._workerClient.eventHandler.on(callback);
    };

    return DashboardWorker;
});