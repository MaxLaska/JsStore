namespace JsStore {
    export namespace Business {
        export namespace Select {
            export class Instance extends Helper {
                _isOr: boolean;
                constructor(query: ISelect, onSuccess: (results: any[]) => void, onError: (err: IError) => void) {
                    super();
                    this._onError = onError;
                    if (this.getTable(query.From)) {
                        this._onSuccess = onSuccess;
                        this._query = query;
                        this._skipRecord = this._query.Skip;
                        this._limitRecord = this._query.Limit;
                        this._tableName = this._query.From;
                        try {
                            this.createTransaction();
                            if (query.Where) {
                                if (Array.isArray(query.Where)) {
                                    this.processWhereArrayQry();
                                }
                                else {
                                    this.processWhere(false);
                                }
                            }
                            else {
                                this.executeWhereUndefinedLogic();
                            }
                        }
                        catch (ex) {
                            this._errorOccured = true;
                            this.onExceptionOccured.call(this, ex, { TableName: query.From });
                        }
                    }
                    else {
                        this._errorOccured = true;
                        this.onErrorOccured(
                            new Error(Error_Type.TableNotExist, { TableName: query.From }).get(),
                            true
                        );
                    }
                }

                private processWhereArrayQry = function () {
                    this._isArrayQry = true;
                    var where_query = this._query.Where,
                        output = [], operation,
                        pKey = this.getPrimaryKey(this._query.From),
                        isItemExist = function (keyValue) {
                            var is_exist = false;
                            output.every(function (item) {
                                if (item[pKey] === keyValue) {
                                    is_exist = true;
                                    return false;
                                }
                                return true;
                            });
                            return is_exist;
                        },
                        onSuccess = function () {
                            if (operation === 'and') {
                                if (output.length > 0) {
                                    var and_results = [];
                                    this._results.forEach(function (item) {
                                        if (isItemExist(item[pKey])) {
                                            and_results.push(item);
                                        }
                                    });
                                    output = and_results;
                                    and_results = null;
                                }
                                else {
                                    output = this._results;
                                }
                            }
                            else {
                                if (output.length > 0) {
                                    this._results = output.concat(this._results);
                                    this.removeDuplicates();
                                    output = this._results;
                                }
                                else {
                                    output = this._results;
                                }
                            }
                            if (where_query.length > 0) {
                                this._results = [];
                                processFirstQry();
                            }
                            else {
                                this._results = output;
                            }
                        }.bind(this),
                        processFirstQry = function () {
                            this._query.Where = where_query.shift();
                            if (this._query.Where['Or']) {
                                if (Object.keys(this._query.Where).length === 1) {
                                    operation = 'or';
                                    this._query.Where = this._query.Where['Or'];
                                    this._onWhereArrayQrySuccess = onSuccess;
                                }
                                else {
                                    operation = 'and';
                                    this._onWhereArrayQrySuccess = onSuccess;
                                }
                            }
                            else {
                                operation = 'and';
                                this._onWhereArrayQrySuccess = onSuccess;
                            }
                            this.processWhere(true);
                        }.bind(this);
                    processFirstQry();
                };

                private createTransaction = function () {
                    this._transaction = db_connection.transaction([this._query.From], "readonly");
                    this._transaction.oncomplete = this.onTransactionCompleted.bind(this);
                    (this._transaction as any).ontimeout = this.onTransactionTimeout.bind(this);
                    this._objectStore = this._transaction.objectStore(this._query.From);
                };

                private processWhere = function (isTransactionCreated) {
                    if (this._query.Where.Or) {
                        this.processOrLogic();
                    }
                    this.goToWhereLogic();
                };

                private onQueryFinished = function () {
                    if (this._isOr) {
                        this.orQuerySuccess();
                    }
                    else if (this._isArrayQry) {
                        this._onWhereArrayQrySuccess();
                    }
                };

                private onTransactionCompleted = function () {
                    this.processOrderBy();
                    if (this._query.Distinct) {
                        var group_by = [];
                        var result = this._results[0];
                        for (var key in result) {
                            group_by.push(key);
                        }
                        var primary_key = this.getPrimaryKey(this._query.From),
                            index = group_by.indexOf(primary_key);
                        group_by.splice(index, 1);
                        this._query.GroupBy = group_by.length > 0 ? group_by : null;
                    }
                    if (this._query.GroupBy) {
                        if (this._query.Aggregate) {
                            this.executeAggregateGroupBy();
                        }
                        else {
                            this.processGroupBy();
                        }
                    }
                    else if (this._query.Aggregate) {
                        this.processAggregateQry();
                    }
                    this._onSuccess(this._results);
                };

                private orQueryFinish = function () {
                    this._isOr = false;
                    this._results = (this as any)._orInfo.Results;
                    // free or info memory
                    (this as any)._orInfo = undefined;
                    this.removeDuplicates();
                    this.onQueryFinished();
                };

                private orQuerySuccess = function () {
                    (this as any)._orInfo.Results = (this as any)._orInfo.Results.concat(this._results);
                    if (!this._query.Limit || (this._query.Limit > (this as any)._orInfo.Results.length)) {
                        this._results = [];
                        var key = getObjectFirstKey((this as any)._orInfo.OrQuery);
                        if (key != null) {
                            var where = {};
                            where[key] = (this as any)._orInfo.OrQuery[key];
                            delete (this as any)._orInfo.OrQuery[key];
                            this._query.Where = where;
                            this.goToWhereLogic();
                        }
                        else {
                            this.orQueryFinish();
                        }
                    }
                    else {
                        this.orQueryFinish();
                    }
                };

                private processOrLogic = function () {
                    this._isOr = true;
                    (this as any)._orInfo = {
                        OrQuery: this._query.Where.Or,
                        Results: []
                    };
                    // free or memory
                    delete this._query.Where.Or;
                };
            }
        }
    }
}
