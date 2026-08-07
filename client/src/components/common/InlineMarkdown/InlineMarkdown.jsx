/*!
 * Copyright (c) 2026 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

import React, { useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import transform from '@diplodoc/transform';
import { defaultOptions as defaultSanitizeOptions } from '@diplodoc/transform/lib/sanitize';
import { colorClassName } from '@gravity-ui/markdown-editor';

import plugins from '../../../configs/markdown-plugins';

// Renders a single line of markdown inline (without the block <p> wrapper),
// using the exact same transform pipeline as <Markdown> — so links, sanitizing
// and every plugin behave identically to card descriptions and comments. Used
// for short, single-line fields like task-list items.
const InlineMarkdown = React.memo(({ children, linkStopPropagation }) => {
  const html = useMemo(() => {
    try {
      const { result } = transform(children, {
        plugins,
        breaks: true,
        linkify: true,
        linkifyTlds: null,
        sanitizeOptions: {
          ...defaultSanitizeOptions,
          allowedSchemesByTag: { img: ['http', 'https', 'data'] },
        },
        defaultClassName: colorClassName,
      });

      // Unwrap a single top-level paragraph so the content flows inline.
      return result.html
        .trim()
        .replace(/^<p>/, '')
        .replace(/<\/p>$/, '');
    } catch (error) {
      return error.toString();
    }
  }, [children]);

  const wrapperRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;

    if (!linkStopPropagation || !wrapper) {
      return undefined;
    }

    // A click on a link inside the text shouldn't also trigger the surrounding
    // element's handler (e.g. opening the task editor). A native listener is
    // used because the content is set via dangerouslySetInnerHTML, so there is
    // no React node to attach an onClick to.
    const handleClick = (event) => {
      if (event.target.closest('a')) {
        event.stopPropagation();
      }
    };

    wrapper.addEventListener('click', handleClick);
    return () => wrapper.removeEventListener('click', handleClick);
  }, [linkStopPropagation, html]);

  return (
    <span
      ref={wrapperRef}
      className="yfm"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

InlineMarkdown.propTypes = {
  children: PropTypes.string.isRequired,
  linkStopPropagation: PropTypes.bool,
};

InlineMarkdown.defaultProps = {
  linkStopPropagation: false,
};

export default InlineMarkdown;
