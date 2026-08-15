/**
 * useApi.js
 * -----------------------------------------------------------------------------
 * Two small hooks that remove the most repetitive code in the whole frontend.
 *
 * Every screen that loads data needs the same four things: data, loading,
 * error, and a way to refetch. Writing that by hand in each component means
 * ~20 lines of duplicated useState/useEffect - and it is where bugs like
 * "setState after unmount" and stale responses creep in.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Runs an async request when the component mounts (and whenever `deps` change).
 *
 * @param {Function} requestFn  Async function returning the API response.
 * @param {Array}    deps       Re-run when any of these change.
 * @param {object}   options
 * @param {boolean}  options.enabled  Skip the request when false.
 *
 * @returns {{data, error, isLoading, refetch, setData}}
 *
 * @example
 *   const { data, isLoading } = useFetch(() => jobApi.list({ page }), [page]);
 */
export const useFetch = (requestFn, deps = [], { enabled = true } = {}) => {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(enabled);

    // Guards against updating state after the component has unmounted, and
    // against an older slow request overwriting a newer fast one.
    const isMounted = useRef(true);
    const requestId = useRef(0);

    // Keep the latest function in a ref so callers can pass an inline arrow
    // function without it re-triggering the effect on every render.
    const savedRequest = useRef(requestFn);
    savedRequest.current = requestFn;

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const execute = useCallback(async () => {
        const currentRequest = ++requestId.current;

        setIsLoading(true);
        setError(null);

        try {
            const response = await savedRequest.current();

            // Ignore responses from superseded requests.
            if (isMounted.current && currentRequest === requestId.current) {
                setData(response);
            }

            return response;
        } catch (caught) {
            if (isMounted.current && currentRequest === requestId.current) {
                setError(caught);
            }

            return null;
        } finally {
            if (isMounted.current && currentRequest === requestId.current) {
                setIsLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        if (!enabled) {
            setIsLoading(false);
            return;
        }

        execute();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, enabled]);

    return { data, error, isLoading, refetch: execute, setData };
};

/**
 * For actions the USER triggers: submitting a form, applying to a job,
 * changing a status. Nothing runs until you call `mutate()`.
 *
 * @example
 *   const { mutate, isLoading, error } = useMutation(jobApi.apply);
 *   await mutate(jobId);
 */
export const useMutation = (mutationFn, { onSuccess, onError } = {}) => {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const mutate = useCallback(
        async (...args) => {
            setIsLoading(true);
            setError(null);

            try {
                const response = await mutationFn(...args);

                if (isMounted.current) {
                    setData(response);
                }

                onSuccess?.(response);
                return response;
            } catch (caught) {
                if (isMounted.current) {
                    setError(caught);
                }

                onError?.(caught);

                // Re-thrown so callers can `try/catch` around mutate() when they
                // need to branch on failure.
                throw caught;
            } finally {
                if (isMounted.current) {
                    setIsLoading(false);
                }
            }
        },
        [mutationFn, onSuccess, onError]
    );

    const reset = useCallback(() => {
        setData(null);
        setError(null);
        setIsLoading(false);
    }, []);

    return { mutate, data, error, isLoading, reset };
};

/**
 * Delays a rapidly-changing value. Used for search boxes so we fire one request
 * after the user stops typing instead of one per keystroke.
 */
export const useDebouncedValue = (value, delay = 400) => {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debounced;
};
