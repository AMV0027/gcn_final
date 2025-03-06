import React from 'react';
import ReactMarkdown from 'react-markdown';
import gfm from 'remark-gfm';
import styles from './markdown-styles.module.css';

const StyledMarkdown = ({ content }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[[gfm, { singleTilde: false }]]}
      className={styles.reactMarkDown}
      children={content}
    />
  );
};

export default StyledMarkdown;