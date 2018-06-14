export default class APIClient {
  /**
   * A fetch abstraction.
   * @param  {String} url
   * @param  {Object} requestOptions
   * @return {Promise}
   */
  _sendRequest(url, requestOptions) {
    if (requestOptions.constructor !== Object || Object.keys(requestOptions).length === 0) {
      return Promise.reject('A request options object is required');
    }

    // if the body exists and is not a string, then stringify it.
    if (requestOptions.body && requestOptions.body.constructor !== String) {
      requestOptions.body = JSON.stringify(requestOptions.body);
    }

    return fetch(url, requestOptions)
    .then((res) => {
      if (!res.ok) {
        throw res;
      }

      if (requestOptions.raw) {
        return res;
      }

      return res.json();
    });
  }

  /**
   * Attempt of an abstract method.
   * @throws {Error} If you call this method directly.
   */
  _getRequestHeaders() {
    throw new Error('You cannot call this method directly. You must override it');
  }
}
