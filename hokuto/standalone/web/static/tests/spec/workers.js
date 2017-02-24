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

// Jasmine globals
/* global describe it expect spyOn beforeEach afterEach fail */

define(['libs/rsvp', 'workerclient', 'workers/workerserver', 'onoc.config', 'console', 'observable'], function(RSVP, WorkerClient, WorkerServer, Config, Console, Observable) {
    describe('The worker communication layer', function() {
        //### TEST SETUP ###
        /**
         * Contains the instance of WorkerMock where worker messages should be redirected to
         * @type {WorkerMock}
         */
        var currentActiveWorkerMock = null;

        /**
         * Contains the WorkerServer instance active in the current test
         * @type {ServerWorker}
         */
        var currentActiveWorkerServer = null;

        var legit_Worker = null;
        var legit_require = null;
        var legit_server_postMessage = null;

        var serverProxyModuleName = 'proxyModule';
        var config_default_baseUrl = 'http://localhost';
        var config_default_separator = ';';
        var config_default_isAdmin = false;
        var config_default_shinkenContact = 'contact';

        var serverReadyCallback = null;

        /**
         * Creates a deep copy of an object
         * @param {Object} message The object to copy
         * @return {Object} The copy
         */
        function copyMessage(message) {
            message = JSON.stringify(message);
            return JSON.parse(message);
        }

        function createWorkerMock() {
            /**
             * A mock class for the native Worker class
             * @class
             */
            var WorkerMock = function(workerTarget) {
                this.workerTarget = workerTarget;

                // Native properties
                this.onmessage = null;
                this.onerror = null;

                currentActiveWorkerMock = this;

                this.constructorEnd();
            };

            WorkerMock.prototype.postMessage = function(message) {
                // Call the current server's onmessage
                //onmessage(copyMessage(message));
                setTimeout(function() {
                    if(currentActiveWorkerServer) {
                        currentActiveWorkerServer._dispatch(copyMessage(message));
                    }
                    else {
                        fail('Internal test problem : No current worker server available');
                    }
                }, 1);
            };

            WorkerMock.prototype.constructorEnd = function() {
                // Can be used to customize the constructor's behavior during tests

                // Default behavior: simulate the worker server being created inside the worker process!
                setTimeout(function() {
                    var server = new WorkerServer();
                    currentActiveWorkerServer = server;

                    if(serverReadyCallback) {
                        serverReadyCallback(server);
                    }
                }, 1);
            };

            return WorkerMock;
        }

        function createProxyMock() {
            return function() {
                this.isEmptyProxy = true;
            };
        }

        function postMessageMock(message) {
            setTimeout(function() {
                if(currentActiveWorkerMock.onmessage) {
                    currentActiveWorkerMock.onmessage({
                        data: copyMessage(message)
                    });
                }
                else {
                    fail('There is a problem: no currently active worker client');
                }
            }, 1);
        }

        /**
         * Mocks the require function during the tests
         */
        function requireMock(moduleName) {
            if(moduleName === serverProxyModuleName) {
                return createProxyMock();
            }
            else {
                return legit_require(moduleName);
            }
        }

        function whenServerIsReady(callback) {
            if(currentActiveWorkerServer) {
                callback(currentActiveWorkerServer);
            }
            else {
                serverReadyCallback = callback;
            }
        }

        beforeEach(function() {
            // Here we setup mocks so that the server and client can execute in the same environment
            // and naturally receive each other's messages. Basically:
            // - Mock the Worker class, and the global onmessage and postMessage
            // - calling Worker.postMessage redirects to global onmessage
            // - calling global postMessage redirects to Worker.onmessage

            legit_Worker = window.Worker;
            legit_server_postMessage = WorkerServer.prototype.postMessage;
            legit_require = window.require;

            window.Worker = createWorkerMock();
            WorkerServer.prototype.postMessage = postMessageMock;
            window.require = requireMock;

            // Reset configuration
            Config.setValues(
                config_default_baseUrl,
                config_default_separator,
                config_default_isAdmin,
                config_default_shinkenContact
            );
        });

        afterEach(function() {
            // Restore mocked objets/functions
            window.Worker = legit_Worker;
            WorkerServer.prototype.postMessage = legit_server_postMessage;
            window.require = legit_require;

            // Empty test data
            legit_Worker = null;
            legit_server_postMessage = null;
            legit_require = null;

            serverReadyCallback = null;
            currentActiveWorkerMock = null;
            currentActiveWorkerServer = null;
        });

        //### TEST CONTENTS ###

        describe('client component', function() {
            // Only put tests specific to the client here
            it('reports system worker errors', function(done) {
                // Checks what happens on the client side if the worker's onerror event is triggered
                Worker.prototype.constructorEnd = function() {
                    // Trigger an error instead of creating the server
                    setTimeout(function() {
                        currentActiveWorkerMock.onerror();

                        // Assert AFTER the error occured
                        expect(client.postMessage).toHaveBeenCalledTimes(0);
                        expect(Console.error).toHaveBeenCalled();

                        done();
                    }, 1);
                };

                // The initialization process should not happen
                spyOn(WorkerClient.prototype, 'postMessage');

                // An error should be displayed in the console
                spyOn(Console, 'error');

                // Create a client
                var client = new WorkerClient('errorTest');

                // Assertions found in the building replacement
            });
        });

        describe('as a whole', function() {
            it('correctly executes the initialization sequence', function(done) {
                var endMessage = 'test is done!';
                spyOn(Config, 'import');
                spyOn(window, 'require').and.callThrough();

                var client = new WorkerClient(serverProxyModuleName);
                // Post a message; the test finishes when the server receives it
                client.postMessage(endMessage);

                //expect(currentActiveWorkerMock.workerTarget).toBe(serverProxyModuleName);

                whenServerIsReady(function(server) {
                    server.onunhandledmessage = function(message) {
                        expect(message).toBe(endMessage);

                        // Client should be in "initialization finished" state
                        expect(client.readyState).toBe(1);

                        // The server should have required the proxy module
                        expect(require).toHaveBeenCalledWith(serverProxyModuleName);

                        // The server should have imported the configuration
                        expect(Config.import).toHaveBeenCalled();

                        done();
                    };
                });
            });

            describe('transmitting remote calls from client to server', function() {
                it('handles simple results', function(done) {
                    var ProxyMock = function() {
                    };
                    // myMethod should eventually be called if all goes well
                    ProxyMock.prototype.myMethod = function(arg1, arg2) {
                        expect(this instanceof ProxyMock).toBe(true);
                        expect(arg1).toBe(1);
                        expect(arg2).toBe('rere');

                        return 'myMethod ok';
                    };

                    var legit_createProxyMock = createProxyMock;
                    // eslint-disable-next-line no-func-assign
                    createProxyMock = function() {
                        return ProxyMock;
                    };

                    var client = new WorkerClient(serverProxyModuleName);

                    client.call('myMethod', [1, 'rere']).then(function(result) {
                        expect(result).toBe('myMethod ok');
                    }).catch(function(error) {
                        expect('An error that should not have happened: ' + error).toBe('--');
                    }).finally(function() {
                        // Cleanup
                        // eslint-disable-next-line no-func-assign
                        createProxyMock = legit_createProxyMock;
                        done();
                    });
                });

                it('handles errors', function(done) {
                    var SomeError = function(message) {
                        this.name = 'SomeError';
                        this.message = message;
                    };
                    SomeError.prototype = Error.prototype;

                    var ProxyMock = function() {
                    };
                    // myMethod should eventually be called if all goes well
                    ProxyMock.prototype.myMethod = function() {
                        throw new SomeError('oh no!');
                    };

                    var legit_createProxyMock = createProxyMock;
                    // eslint-disable-next-line no-func-assign
                    createProxyMock = function() {
                        return ProxyMock;
                    };

                    var client = new WorkerClient(serverProxyModuleName);

                    client.call('myMethod', [1, 'rere']).then(function() {
                        expect('An error should have happened!').toBe('--');
                    }).catch(function(error) {
                        expect(error).toBe('oh no!');
                    }).finally(function() {
                        // Cleanup
                        // eslint-disable-next-line no-func-assign
                        createProxyMock = legit_createProxyMock;
                        done();
                    });
                });

                it('handles successful promises', function(done) {
                    var ProxyMock = function() {
                    };
                    // myMethod should eventually be called if all goes well
                    ProxyMock.prototype.myMethod = function() {
                        return new RSVP.Promise(function(resolve) {
                            resolve(4);
                        });
                    };

                    var legit_createProxyMock = createProxyMock;
                    // eslint-disable-next-line no-func-assign
                    createProxyMock = function() {
                        return ProxyMock;
                    };

                    var client = new WorkerClient(serverProxyModuleName);

                    client.call('myMethod', [1, 'rere']).then(function(result) {
                        expect(result).toBe(4);
                    }).catch(function(error) {
                        expect('An error that should not have happened: ' + error).toBe('--');
                    }).finally(function() {
                        // Cleanup
                        // eslint-disable-next-line no-func-assign
                        createProxyMock = legit_createProxyMock;
                        done();
                    });
                });

                it('handles failed promises', function(done) {
                    var ProxyMock = function() {
                    };
                    // myMethod should eventually be called if all goes well
                    ProxyMock.prototype.myMethod = function() {
                        return new RSVP.Promise(function(resolve, reject) {
                            reject('look at my error');
                        });
                    };

                    var legit_createProxyMock = createProxyMock;
                    // eslint-disable-next-line no-func-assign
                    createProxyMock = function() {
                        return ProxyMock;
                    };

                    var client = new WorkerClient(serverProxyModuleName);

                    client.call('myMethod', [1, 'rere']).then(function() {
                        expect('An error should have happened!').toBe('--');
                    }).catch(function(error) {
                        expect(error).toBe('look at my error');
                    }).finally(function() {
                        // Cleanup
                        // eslint-disable-next-line no-func-assign
                        createProxyMock = legit_createProxyMock;
                        done();
                    });
                });
            });

            describe('transmitting console messages from server to client', function() {
                it('works', function(done) {
                    var client = new WorkerClient(serverProxyModuleName);

                    spyOn(Console, 'warn').and.callFake(function(message) {
                        expect(message).toBe('hi');

                        done();
                    });

                    whenServerIsReady(function(server) {
                        server.onunhandledmessage = function() {
                            // Send a log message through the server
                            server.sendConsoleMessage('hi', WorkerServer.LOG_LEVEL.WARN);
                        };
                    });

                    client.postMessage('unhendled');
                });

                it('fixes incorrect console level with WARN', function(done) {
                    var client = new WorkerClient(serverProxyModuleName);

                    spyOn(Console, 'warn').and.callFake(function(message) {
                        expect(message).toBe('[incorrect log level "kek"] hi');

                        done();
                    });

                    whenServerIsReady(function(server) {
                        server.onunhandledmessage = function() {
                            // Send a log message through the server
                            server.sendConsoleMessage('hi', 'kek');
                        };
                    });

                    client.postMessage('unhandled');
                });
            });

            describe('transmitting events from server to client', function() {
                it('works', function(done) {
                    var client = new WorkerClient(serverProxyModuleName);
                    client.postMessage('unhandled');

                    whenServerIsReady(function(server) {
                        server.onunhandledmessage = function() {
                            // Trigger an event
                            server.trigger('myEvent', 'my data');
                        };
                    });

                    // Check that the observable gets triggered
                    spyOn(Observable.prototype, 'trigger').and.callFake(function(eventName, eventData) {
                        expect(eventName).toBe('myEvent');
                        expect(eventData).toBe('my data');

                        done();
                    });
                });
            });
        });
    });
});